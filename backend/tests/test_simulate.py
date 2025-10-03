"""Unittest-based tests for the 2D frame simulation MVP.

Cantilever beam with end load analytical (Euler-Bernoulli):
  v_tip = P * L^3 / (3 E I)
  theta_tip = P * L^2 / (2 E I)
With downward load (negative Fy) we expect negative deflection and rotation sign following right-hand rule.
"""
import unittest

from app import schemas
from app.simulation import simulate_structure, AssemblyError
from app.truss_solver import solve_truss, TrussError


class TestSimulation(unittest.TestCase):
    def test_cantilever_end_load(self):
        E = 210e9  # Pa
        I = 1e-6   # m^4
        A = 1e-3   # m^2
        L = 1.0    # m
        P = -1000.0  # N (downward)

        nodes = [
            schemas.NodeInput(id="n1", x=0.0, y=0.0, constraints=schemas.NodeConstraint(fix_x=True, fix_y=True, fix_rotation=True)),
            schemas.NodeInput(id="n2", x=L, y=0.0, constraints=None),
        ]
        beams = [
            schemas.BeamInput(id="b1", node_start="n1", node_end="n2", E=E, I=I, A=A)
        ]
        loads = [
            schemas.LoadInput(node_id="n2", Fx=0.0, Fy=P, Moment=0.0)
        ]

        result = simulate_structure(schemas.SimulationInput(nodes=nodes, beams=beams, loads=loads))
        n2 = next(d for d in result.displacements if d.id == "n2")
        v_expected = P * L**3 / (3 * E * I)
        theta_expected = P * L**2 / (2 * E * I)
        self.assertAlmostEqual(v_expected, n2.uy, delta=abs(v_expected)*1e-3)
        self.assertAlmostEqual(theta_expected, n2.rotation, delta=abs(theta_expected)*1e-3)
        b1 = next(b for b in result.internal_forces if b.id == "b1")
        self.assertLess(abs(b1.axial), 1e-3)

    def test_unstable_structure_raises(self):
        E = 210e9
        I = 1e-6
        A = 1e-3
        nodes = [
            schemas.NodeInput(id="a", x=0.0, y=0.0),
            schemas.NodeInput(id="b", x=1.0, y=0.0),
        ]
        beams = [schemas.BeamInput(id="b1", node_start="a", node_end="b", E=E, I=I, A=A)]
        loads = []
        with self.assertRaises(AssemblyError):
            simulate_structure(schemas.SimulationInput(nodes=nodes, beams=beams, loads=loads))

    def test_axial_tension_force(self):
        # Simple two-node bar in pure tension
        E = 200e9
        A = 2e-4
        I = 1e-8  # negligible bending stiffness for this test
        L = 2.0
        P = 1000.0  # N axial tension at right node
        nodes = [
            schemas.NodeInput(id="n1", x=0.0, y=0.0, constraints=schemas.NodeConstraint(fix_x=True, fix_y=True, fix_rotation=True)),
            schemas.NodeInput(id="n2", x=L, y=0.0)
        ]
        beams = [schemas.BeamInput(id="bar", node_start="n1", node_end="n2", E=E, I=I, A=A)]
        loads = [schemas.LoadInput(node_id="n2", Fx=P, Fy=0.0, Moment=0.0)]
        result = simulate_structure(schemas.SimulationInput(nodes=nodes, beams=beams, loads=loads))
        bar_force = next(b for b in result.internal_forces if b.id == "bar").axial
        # Expected axial elongation force equals applied load (equilibrium) within small tolerance
        self.assertAlmostEqual(bar_force, P, delta=abs(P)*1e-3)
        self.assertGreater(bar_force, 0.0)  # tension positive

    def test_triangle_truss_symmetry(self):
        # Simple symmetric triangle truss with apex load: both diagonals tension, bottom chord tension
        L = 4.0
        h = 3.0
        P = -1000.0  # downward at apex
        # Geometry
        nodes = [
            schemas.NodeInput(id="A", x=0.0, y=0.0, constraints=schemas.NodeConstraint(fix_x=True, fix_y=True, fix_rotation=True)),
            schemas.NodeInput(id="B", x=L, y=0.0, constraints=schemas.NodeConstraint(fix_x=False, fix_y=True, fix_rotation=True)),
            schemas.NodeInput(id="C", x=L/2, y=h)
        ]
        # Members: bottom chord AB, diagonals AC, BC
        E=210e9; Asec=1e-3; I=1e-6
        beams = [
            schemas.BeamInput(id="AB", node_start="A", node_end="B", E=E, I=I, A=Asec),
            schemas.BeamInput(id="AC", node_start="A", node_end="C", E=E, I=I, A=Asec),
            schemas.BeamInput(id="BC", node_start="B", node_end="C", E=E, I=I, A=Asec),
        ]
        loads = [schemas.LoadInput(node_id="C", Fy=P)]
        inp = schemas.SimulationInput(nodes=nodes, beams=beams, loads=loads, analysis_type='truss')
        result = solve_truss(inp)
        forces = {f.id: f.axial for f in result.internal_forces}
        self.assertGreater(forces['AC'], 0.0)
        self.assertGreater(forces['BC'], 0.0)
        self.assertGreater(forces['AB'], 0.0)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
