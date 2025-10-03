"""Basic 2D frame (beam) structural solver.

This is a minimal educational implementation for the MVP. It assembles the global
stiffness matrix for 2D frame (axial + bending) Euler-Bernoulli elements with 3 DOF per node:
    u (x translation), v (y translation), theta (rotation about z).

Assumptions / Simplifications:
- Linear elastic, small displacements.
- No distributed loads (only nodal forces & moments for MVP).
- No shear deformation (Euler-Bernoulli, not Timoshenko).
- Internal forces approximated from local end forces.

Future improvements:
- Distributed loads, beam self weight.
- Shear deformation (Timoshenko) option.
- Stress recovery at arbitrary points.
- Modal / dynamic analysis.
"""
from __future__ import annotations
from typing import Dict, List, Tuple
import math
import numpy as np
from . import schemas

DOF_PER_NODE = 3  # u, v, theta

class AssemblyError(Exception):
    pass

def _node_dof_indices(node_index: int) -> Tuple[int, int, int]:
    base = node_index * DOF_PER_NODE
    return base, base + 1, base + 2

def _build_node_index_map(nodes: List[schemas.NodeInput]) -> Dict[str, int]:
    return {n.id: i for i, n in enumerate(nodes)}

def _element_stiffness(E: float, A: float, I: float, x1: float, y1: float, x2: float, y2: float) -> Tuple[np.ndarray, float, float, float]:
    dx = x2 - x1
    dy = y2 - y1
    L = math.hypot(dx, dy)
    if L <= 0:
        raise AssemblyError("Zero length element")
    c = dx / L
    s = dy / L
    # Local stiffness for 2D frame element (axial + bending)
    EA_L = E * A / L
    EI = E * I
    L2 = L * L
    L3 = L2 * L
    k = np.zeros((6, 6), dtype=float)
    # Axial terms
    k[0,0] = k[3,3] = EA_L
    k[0,3] = k[3,0] = -EA_L
    # Bending terms
    k[1,1] = k[4,4] = 12*EI / L3
    k[1,4] = k[4,1] = -12*EI / L3
    k[1,2] = k[2,1] = 6*EI / L2
    k[1,5] = k[5,1] = 6*EI / L2
    k[4,2] = k[2,4] = -6*EI / L2
    k[4,5] = k[5,4] = -6*EI / L2
    k[2,2] = 4*EI / L
    k[5,5] = 4*EI / L
    k[2,5] = k[5,2] = 2*EI / L
    # Transformation matrix
    T = np.array([
        [ c, -s, 0, 0,  0, 0],
        [ s,  c, 0, 0,  0, 0],
        [ 0,  0, 1, 0,  0, 0],
        [ 0,  0, 0, c, -s, 0],
        [ 0,  0, 0, s,  c, 0],
        [ 0,  0, 0, 0,  0, 1],
    ], dtype=float)
    k_global = T.T @ k @ T
    return k_global, L, c, s

def simulate_structure(inp: schemas.SimulationInput) -> schemas.SimulationResult:
    nodes = inp.nodes
    beams = inp.beams
    loads = inp.loads
    n_nodes = len(nodes)
    if n_nodes == 0:
        return schemas.SimulationResult(displacements=[], internal_forces=[])

    node_index = _build_node_index_map(nodes)
    ndof = n_nodes * DOF_PER_NODE
    K = np.zeros((ndof, ndof), dtype=float)
    F = np.zeros(ndof, dtype=float)

    # Assemble element stiffness
    element_descriptors = []  # store for internal force recovery
    for b in beams:
        if b.node_start not in node_index or b.node_end not in node_index:
            raise AssemblyError(f"Beam {b.id} references unknown node")
        i = node_index[b.node_start]
        j = node_index[b.node_end]
        ni = nodes[i]
        nj = nodes[j]
        k_e, L, c, s = _element_stiffness(b.E, b.A, b.I, ni.x, ni.y, nj.x, nj.y)
        dofs_i = _node_dof_indices(i)
        dofs_j = _node_dof_indices(j)
        dof_map = list(dofs_i + dofs_j)
        for a in range(6):
            Aidx = dof_map[a]
            for bidx in range(6):
                Bidx = dof_map[bidx]
                K[Aidx, Bidx] += k_e[a, bidx]
        element_descriptors.append((b, dof_map, k_e))

    # Assemble load vector
    for load in loads:
        if load.node_id not in node_index:
            raise AssemblyError(f"Load references unknown node {load.node_id}")
        idx = node_index[load.node_id]
        ux, uy, r = _node_dof_indices(idx)
        F[ux] += load.Fx
        F[uy] += load.Fy
        F[r] += load.Moment

    # Boundary conditions
    constrained_dofs = set()
    for n in nodes:
        idx = node_index[n.id]
        ux, uy, r = _node_dof_indices(idx)
        if n.constraints:
            if n.constraints.fix_x: constrained_dofs.add(ux)
            if n.constraints.fix_y: constrained_dofs.add(uy)
            if n.constraints.fix_rotation: constrained_dofs.add(r)
    all_dofs = set(range(ndof))
    free_dofs = sorted(list(all_dofs - constrained_dofs))

    if len(free_dofs) == 0:
        # All constrained: displacements zero
        displacements = [schemas.NodeResult(id=n.id, ux=0.0, uy=0.0, rotation=0.0) for n in nodes]
        internal = [schemas.BeamInternalForce(id=b.id, axial=0, shear_start=0, shear_end=0, moment_start=0, moment_end=0) for b in beams]
        return schemas.SimulationResult(displacements=displacements, internal_forces=internal)

    # Reduced system
    K_ff = K[np.ix_(free_dofs, free_dofs)]
    F_f = F[free_dofs]

    # Solve
    try:
        U_f = np.linalg.solve(K_ff, F_f)
    except np.linalg.LinAlgError:
        # Singular matrix (e.g., mechanism)
        raise AssemblyError("Global stiffness matrix is singular. Structure may be unstable or insufficient constraints.")

    # Reconstruct full displacement vector
    U = np.zeros(ndof, dtype=float)
    for idx, dof in enumerate(free_dofs):
        U[dof] = U_f[idx]

    # Build node results
    node_results: List[schemas.NodeResult] = []
    for n in nodes:
        i = node_index[n.id]
        ux_d, uy_d, r_d = _node_dof_indices(i)
        node_results.append(
            schemas.NodeResult(
                id=n.id,
                ux=U[ux_d],
                uy=U[uy_d],
                rotation=U[r_d],
            )
        )

    # Internal forces (local end forces from k_local * u_local)
    beam_results: List[schemas.BeamInternalForce] = []
    for beam, dof_map, k_global in element_descriptors:
        # We need local k to get standard interpretation; we approximated using k_global only here.
        # Recompute local and transformation to recover local forces cleanly.
        ni = nodes[node_index[beam.node_start]]
        nj = nodes[node_index[beam.node_end]]
        k_glob, L, c, s = _element_stiffness(beam.E, beam.A, beam.I, ni.x, ni.y, nj.x, nj.y)
        # Rebuild T (duplicated from stiffness routine)
        T = np.array([
            [ c, -s, 0, 0,  0, 0],
            [ s,  c, 0, 0,  0, 0],
            [ 0,  0, 1, 0,  0, 0],
            [ 0,  0, 0, c, -s, 0],
            [ 0,  0, 0, s,  c, 0],
            [ 0,  0, 0, 0,  0, 1],
        ], dtype=float)
        # Derive local stiffness by inverting transform: k_local = T k_global T^T (approx here)
        k_local = T @ k_glob @ T.T
        u_elem_global = U[dof_map]
        u_local = T @ u_elem_global
        f_local = k_local @ u_local
        axial = f_local[0]  # axial force at start
        shear_start = f_local[1]
        moment_start = f_local[2]
        shear_end = -f_local[4]  # opposite sign end
        moment_end = -f_local[5]
        beam_results.append(
            schemas.BeamInternalForce(
                id=beam.id,
                axial=axial,
                shear_start=shear_start,
                shear_end=shear_end,
                moment_start=moment_start,
                moment_end=moment_end,
            )
        )

    return schemas.SimulationResult(displacements=node_results, internal_forces=beam_results)
