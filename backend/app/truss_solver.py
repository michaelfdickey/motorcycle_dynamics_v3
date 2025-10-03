"""Simple planar truss (pin-jointed, axial-only) solver using method of joints.

Assumptions:
- All members are two-force members (axial only, no bending/shear, no weight).
- Supports specified via node constraints (fix_x / fix_y). fix_rotation ignored.
- Structure is statically determinate: m + r == 2j where r = number of reaction components.
- Small displacements; geometry from original coordinates.

Returns axial forces (positive tension) mapped into SimulationResult format with
shear/moment fields zeroed for compatibility.
"""
from __future__ import annotations
from typing import List, Dict, Tuple
import math
import numpy as np
from . import schemas

class TrussError(Exception):
    pass

def solve_truss(inp: schemas.SimulationInput) -> schemas.SimulationResult:
    nodes = inp.nodes
    beams = inp.beams
    loads = inp.loads
    n_nodes = len(nodes)
    if n_nodes == 0:
        return schemas.SimulationResult(displacements=[], internal_forces=[])

    # Map node id -> index
    node_index = {n.id: i for i, n in enumerate(nodes)}

    # Count reaction DOFs (translational only)
    reaction_dofs: List[Tuple[int, str]] = []  # (node_index, 'x'/'y')
    for i, n in enumerate(nodes):
        if n.constraints:
            if n.constraints.fix_x:
                reaction_dofs.append((i, 'x'))
            if n.constraints.fix_y:
                reaction_dofs.append((i, 'y'))

    m = len(beams)
    r = len(reaction_dofs)
    j = n_nodes
    if m + r != 2 * j:
        # Not statically determinate (could be unstable or indeterminate)
        raise TrussError(f"Truss not statically determinate: m+r={m+r}, 2j={2*j}")

    # Unknown order: all member axial forces (tension +) then reactions
    n_unknowns = m + r
    A = np.zeros((2 * j, n_unknowns), dtype=float)
    b = np.zeros(2 * j, dtype=float)

    # Precompute geometry
    member_dirs: List[Tuple[float, float, float]] = []  # (c, s, L)
    member_nodes: List[Tuple[int, int]] = []
    for beam in beams:
        if beam.node_start not in node_index or beam.node_end not in node_index:
            raise TrussError(f"Beam {beam.id} references unknown node")
        i = node_index[beam.node_start]
        jn = node_index[beam.node_end]
        n1 = nodes[i]
        n2 = nodes[jn]
        dx = n2.x - n1.x
        dy = n2.y - n1.y
        L = math.hypot(dx, dy)
        if L <= 0:
            raise TrussError("Zero-length member")
        c = dx / L
        s = dy / L
        member_dirs.append((c, s, L))
        member_nodes.append((i, jn))

    # External loads per node (sum if multiple)
    load_map = {n.id: (0.0, 0.0) for n in nodes}
    for ld in loads:
        if ld.node_id not in load_map:
            raise TrussError(f"Load references unknown node {ld.node_id}")
        px, py = load_map[ld.node_id]
        load_map[ld.node_id] = (px + ld.Fx, py + ld.Fy)

    # Assemble joint equilibrium rows
    # Row indexing: node i => 2*i (Fx eq), 2*i+1 (Fy eq)
    for member_idx, (i, jn) in enumerate(member_nodes):
        c, s, _L = member_dirs[member_idx]
        # Fx equilibrium contributions
        A[2*i, member_idx] += c      # tension pulls away from i along +c
        A[2*jn, member_idx] -= c     # opposite at j
        # Fy equilibrium
        A[2*i+1, member_idx] += s
        A[2*jn+1, member_idx] -= s

    # Reaction columns
    for r_idx, (ni, axis) in enumerate(reaction_dofs):
        col = m + r_idx
        if axis == 'x':
            A[2*ni, col] = 1.0
        else:
            A[2*ni+1, col] = 1.0

    # RHS = -external loads
    for ni, n in enumerate(nodes):
        Fx, Fy = load_map[n.id]
        b[2*ni] = -Fx
        b[2*ni+1] = -Fy

    try:
        x = np.linalg.solve(A, b)
    except np.linalg.LinAlgError:
        raise TrussError("Singular equilibrium system (unstable or indeterminate)")

    member_forces = x[:m]
    # reactions = x[m:]  # Not returned currently

    # Build results (no displacements in simple statics model)
    displacements = [schemas.NodeResult(id=n.id, ux=0.0, uy=0.0, rotation=0.0) for n in nodes]
    internal = []
    for beam, F in zip(beams, member_forces):
        internal.append(
            schemas.BeamInternalForce(
                id=beam.id,
                axial=F,  # + tension
                shear_start=0.0,
                shear_end=0.0,
                moment_start=0.0,
                moment_end=0.0,
            )
        )

    return schemas.SimulationResult(displacements=displacements, internal_forces=internal)
