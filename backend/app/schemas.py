from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field

class NodeConstraint(BaseModel):
    """Boundary condition flags for a node (2D frame: 3 DOF/node)."""
    fix_x: bool = False
    fix_y: bool = False
    fix_rotation: bool = False

class NodeInput(BaseModel):
    id: str
    x: float
    y: float
    constraints: Optional[NodeConstraint] = None

class BeamInput(BaseModel):
    id: str
    node_start: str = Field(..., description="ID of start node")
    node_end: str = Field(..., description="ID of end node")
    E: float = Field(..., description="Young's modulus")
    I: float = Field(..., description="Second moment of area (bending about z)")
    A: float = Field(..., description="Cross-sectional area")

class LoadInput(BaseModel):
    node_id: str
    Fx: float = 0.0
    Fy: float = 0.0
    Moment: float = 0.0

class SimulationInput(BaseModel):
    nodes: List[NodeInput]
    beams: List[BeamInput]
    loads: List[LoadInput] = []
    analysis_type: str = Field('frame', description="'frame' for beam/frame analysis, 'truss' for pin-jointed axial-only analysis")

class NodeResult(BaseModel):
    id: str
    ux: float
    uy: float
    rotation: float

class BeamInternalForce(BaseModel):
    id: str
    axial: float
    shear_start: float
    shear_end: float
    moment_start: float
    moment_end: float

class SimulationResult(BaseModel):
    displacements: List[NodeResult]
    internal_forces: List[BeamInternalForce]
