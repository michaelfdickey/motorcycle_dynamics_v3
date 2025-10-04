export interface NodeConstraint {
  fix_x?: boolean;
  fix_y?: boolean;
  fix_rotation?: boolean;
}

export interface NodeInput {
  id: string;
  x: number;
  y: number;
  constraints?: NodeConstraint;
}

export interface BeamInput {
  id: string;
  node_start: string;
  node_end: string;
  E: number;
  I: number;
  A: number;
  section?: BeamSection; // optional selected physical section
}

export interface LoadInput {
  node_id: string;
  Fx?: number;
  Fy?: number;
  Moment?: number;
}

export interface SimulationInput {
  nodes: NodeInput[];
  beams: BeamInput[];
  loads: LoadInput[];
  analysis_type?: string; // 'frame' (default) or 'truss'
}

export type SupportType = 'pin' | 'roller';

// Masses (lumped) are currently frontend-only (not yet sent to backend static solver)
export interface NodeMass {
  id: string;        // internal mass id (e.g. M1)
  node_id: string;   // node it attaches to
  value: number;     // kg
}

export type ToolMode = 'node' | 'beam' | 'fixture' | 'mass' | 'delete';

export type SnapMode = 'major' | 'minor' | 'fine' | 'free';

export type UnitSystem = 'KMS' | 'IPS'; // Kilogram-Meter-Second (SI) or Inch-Pound-Second

export interface UnitFactors {
  length: number; // meters per length unit
  force: number;  // newtons per force unit
  mass: number;   // kg per mass unit
  area: number;   // m^2 per area unit
  inertia: number; // m^4 per inertia unit
  modulus: number; // Pa per modulus unit (E)
}

export interface NodeResult {
  id: string;
  ux: number;
  uy: number;
  rotation: number;
}

export interface BeamInternalForce {
  id: string;
  axial: number;
  shear_start: number;
  shear_end: number;
  moment_start: number;
  moment_end: number;
}

export interface SimulationResult {
  displacements: NodeResult[];
  internal_forces: BeamInternalForce[];
}

// Physical catalog section (mirrors backend BeamSection / materials.json structure)
export interface BeamSection {
  material: string;
  grade: string;
  shape: string; // 'round_tube' | 'square_tube' | future
  outer_diameter_in?: number;
  outer_width_in?: number;
  outer_height_in?: number;
  wall_thickness_in?: number;
  area_in2?: number;
  weight_lb_per_ft?: number;
  yield_strength_psi?: number;
  ultimate_strength_psi?: number;
  E_psi?: number;      // Young's modulus (psi) lazily added by backend if missing
  I_in4?: number;      // Second moment of area (in^4) lazily added by backend if missing
}

// Persisted design shape for save/load
export interface DesignData {
  name: string;
  unitSystem: UnitSystem;
  analysisType: 'frame' | 'truss';
  nodes: NodeInput[];
  beams: BeamInput[];
  supports: [string, SupportType][];
  masses: NodeMass[];
  gridSpacing: number;
  snapMode?: SnapMode;
  zoomScale?: number;
  panX?: number;
  panY?: number;
  timestamp?: number;
}

export interface DesignListItem {
  name: string;
  modified: number; // epoch seconds
}
