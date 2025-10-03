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
}

// Masses (lumped) are currently frontend-only (not yet sent to backend static solver)
export interface NodeMass {
  id: string;        // internal mass id (e.g. M1)
  node_id: string;   // node it attaches to
  value: number;     // kg
}

export type ToolMode = 'node' | 'beam' | 'fixture' | 'mass';

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
