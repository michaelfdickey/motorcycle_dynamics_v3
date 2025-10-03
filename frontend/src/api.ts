import { SimulationInput, SimulationResult } from './types';

const API_BASE = 'http://localhost:8000';

export async function simulate(payload: SimulationInput): Promise<SimulationResult> {
  const res = await fetch(`${API_BASE}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error(`Simulation failed: ${res.status}`);
  }
  return res.json();
}
