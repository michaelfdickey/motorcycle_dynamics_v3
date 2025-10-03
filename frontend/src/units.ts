import { UnitFactors, UnitSystem, BeamInput, NodeInput, NodeMass } from './types';

export const UNIT_FACTORS: Record<UnitSystem, UnitFactors> = {
  KMS: {
    length: 1,          // m
    force: 1,           // N
    mass: 1,            // kg
    area: 1,            // m^2
    inertia: 1,         // m^4
    modulus: 1,         // Pa
  },
  IPS: {
    length: 0.0254,                   // m per inch
    force: 4.4482216153,              // N per lbf
    mass: 0.45359237,                 // kg per lbm
    area: 0.0254 * 0.0254,            // m^2 per in^2
    inertia: Math.pow(0.0254, 4),     // m^4 per in^4
    modulus: 6894.757293168,          // Pa per psi
  }
};

export function convertNodePositions(nodes: NodeInput[], fromSys: UnitSystem, toSys: UnitSystem): NodeInput[] {
  if (fromSys === toSys) return nodes;
  const scale = UNIT_FACTORS[fromSys].length / UNIT_FACTORS[toSys].length;
  return nodes.map(n => ({ ...n, x: n.x * scale, y: n.y * scale }));
}

export function convertBeamProperties(beams: BeamInput[], fromSys: UnitSystem, toSys: UnitSystem): BeamInput[] {
  if (fromSys === toSys) return beams;
  const areaScale = UNIT_FACTORS[fromSys].area / UNIT_FACTORS[toSys].area; // multiply by this to re-express numeric A in new system
  const inertiaScale = UNIT_FACTORS[fromSys].inertia / UNIT_FACTORS[toSys].inertia;
  return beams.map(b => ({
    ...b,
    A: b.A * areaScale,
    I: b.I * inertiaScale,
    E: convertModulusBetweenSystems(b.E, fromSys, toSys)
  }));
}

export function getDefaultE(unit: UnitSystem): number {
  // Steel approx: 210 GPa or 30,000,000 psi
  if (unit === 'KMS') return 210e9; // Pa
  return 30_000_000; // psi
}

export function convertModulusToSI(E: number, unit: UnitSystem): number {
  if (unit === 'KMS') return E; // already Pa
  return E * UNIT_FACTORS.IPS.modulus; // psi -> Pa
}

export function convertModulusBetweenSystems(E: number, fromSys: UnitSystem, toSys: UnitSystem): number {
  if (fromSys === toSys) return E;
  // Convert to SI then to target numeric
  const toSI = convertModulusToSI(E, fromSys);
  if (toSys === 'KMS') return toSI; // Pa numeric
  // SI to psi: divide by factor
  return toSI / UNIT_FACTORS.IPS.modulus;
}

export function convertSectionToSI(A: number, I: number, unit: UnitSystem): { A: number; I: number } {
  if (unit === 'KMS') return { A, I };
  return { A: A * UNIT_FACTORS.IPS.area, I: I * UNIT_FACTORS.IPS.inertia };
}

export function convertMasses(masses: NodeMass[], fromSys: UnitSystem, toSys: UnitSystem): NodeMass[] {
  if (fromSys === toSys) return masses;
  const scale = UNIT_FACTORS[fromSys].mass / UNIT_FACTORS[toSys].mass; // multiply to express in new system
  return masses.map(m => ({ ...m, value: m.value * scale }));
}
