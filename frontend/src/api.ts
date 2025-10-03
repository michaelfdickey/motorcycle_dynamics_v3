import { SimulationInput, SimulationResult, DesignData, DesignListItem } from './types';

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

export async function saveDesign(design: DesignData): Promise<DesignData> {
  if (!design.name) throw new Error('Design must have a name');
  const res = await fetch(`${API_BASE}/designs/${encodeURIComponent(design.name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(design)
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
  return res.json();
}

export async function listDesigns(): Promise<DesignListItem[]> {
  const res = await fetch(`${API_BASE}/designs`);
  if (!res.ok) throw new Error('Failed to list designs');
  return res.json();
}

export async function loadDesign(name: string): Promise<DesignData> {
  const res = await fetch(`${API_BASE}/designs/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error('Failed to load design');
  return res.json();
}
