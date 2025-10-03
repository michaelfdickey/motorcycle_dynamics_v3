import React, { useState } from 'react';
import { FrameCanvas } from './components/FrameCanvas';
import { BeamInput, NodeInput, SimulationInput, SimulationResult, ToolMode, NodeMass, UnitSystem, SupportType } from './types';
import { UNIT_FACTORS, convertNodePositions, convertBeamProperties, getDefaultE, convertModulusToSI, convertSectionToSI, convertMasses } from './units';
import { simulate } from './api';

let nodeCounter = 1;
let beamCounter = 1;
let massCounter = 1;

export const App: React.FC = () => {
  const [nodes, setNodes] = useState<NodeInput[]>([]);
  const [beams, setBeams] = useState<BeamInput[]>([]);
  const [pendingBeamStart, setPendingBeamStart] = useState<string | null>(null);
  const [mode, setMode] = useState<ToolMode>('node');
  const [supports, setSupports] = useState<Map<string, SupportType>>(new Map());
  const [masses, setMasses] = useState<NodeMass[]>([]);
  // Default to IPS per user request; values entered / defaults are expressed in IPS unless switched.
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('IPS');
  const [editingMassId, setEditingMassId] = useState<string | null>(null);
  const [editingMassValue, setEditingMassValue] = useState<string>('');
  const [analysisType, setAnalysisType] = useState<'frame' | 'truss'>('truss');
  const [determinacyMsg, setDeterminacyMsg] = useState<string>('');
  const [solvabilityMsg, setSolvabilityMsg] = useState<string>('');

  const startMassEdit = (m: NodeMass) => {
    setEditingMassId(m.id);
    setEditingMassValue(String(m.value));
  };

  const cancelMassEdit = () => {
    setEditingMassId(null);
    setEditingMassValue('');
  };

  const commitMassEdit = (id: string) => {
    if (editingMassId !== id) return; // stale
    const parsed = parseFloat(editingMassValue);
    if (!isFinite(parsed) || parsed < 0) {
      setStatus('Mass value must be a non-negative number.');
      return;
    }
    setMasses(prev => prev.map(m => m.id === id ? { ...m, value: parseFloat(parsed.toFixed(3)) } : m));
    setStatus(`Mass ${id} set to ${parsed} ${unitSystem === 'IPS' ? 'lbm' : 'kg'}`);
    cancelMassEdit();
  };
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [status, setStatus] = useState<string>('');

  const addNode = (x: number, y: number) => {
    const id = `N${nodeCounter++}`;
    setNodes(prev => [...prev, { id, x: parseFloat(x.toFixed(2)), y: parseFloat(y.toFixed(2)) }]);
  };
  const handleNodeClick = (id: string) => {
    if (mode === 'beam') {
      if (pendingBeamStart == null) {
        setPendingBeamStart(id);
        setStatus(`Beam start selected: ${id}. Select end node.`);
      } else if (pendingBeamStart === id) {
        setPendingBeamStart(null);
        setStatus('Cancelled beam selection.');
      } else {
        const beamId = `B${beamCounter++}`;
        // Provide defaults that depend on unit system
        const defaultE = getDefaultE(unitSystem);
        const defaultA = unitSystem === 'KMS' ? 1e-3 : 0.002; // rough difference
        const defaultI = unitSystem === 'KMS' ? 1e-6 : 0.004; // placeholder in^4
        setBeams(prev => [...prev, { id: beamId, node_start: pendingBeamStart, node_end: id, E: defaultE, I: defaultI, A: defaultA }]);
        setPendingBeamStart(null);
        setStatus(`Beam ${beamId} added.`);
      }
    } else if (mode === 'fixture') {
      // cycle: none -> pin -> roller -> none
      setSupports(curr => {
        const next = new Map(curr);
        const currentType = next.get(id);
        let newType: SupportType | undefined;
        if (!currentType) newType = 'pin';
        else if (currentType === 'pin') newType = 'roller';
        else newType = undefined;
        if (newType) next.set(id, newType); else next.delete(id);
        // apply constraints to nodes (pin: fix_x, fix_y; roller: fix_y only)
        setNodes(nodes => nodes.map(n => {
          if (n.id !== id) return n;
            if (!newType) return { ...n, constraints: undefined };
            if (newType === 'pin') return { ...n, constraints: { fix_x: true, fix_y: true, fix_rotation: true } };
            return { ...n, constraints: { fix_x: false, fix_y: true, fix_rotation: true } };
        }));
        setStatus(newType ? `${id} set to ${newType}` : `${id} support removed`);
        return next;
      });
    } else if (mode === 'mass') {
      const massId = `M${massCounter++}`;
        const defaultMass = unitSystem === 'KMS' ? 10 : (10 / UNIT_FACTORS.IPS.mass); // ~10 kg expressed in current units
  const newMass: NodeMass = { id: massId, node_id: id, value: parseFloat(defaultMass.toFixed(2)) };
      setMasses(prev => [...prev, newMass]);
      const massStatus = unitSystem === 'IPS' ? `${newMass.value} lbm` : `${newMass.value} kg`;
      setStatus(`Mass ${massId} (${massStatus} ~10kg physical) attached to ${id}`);
    } else if (mode === 'node') {
      // In node mode clicking existing node does nothing yet
    }
  };

  const runSimulation = async () => {
    // Truss determinacy pre-check (m + r == 2j) when in truss mode
    if (analysisType === 'truss') {
      const m = beams.length;
      const r = Array.from(supports.values()).reduce((acc, t) => acc + (t === 'pin' ? 2 : 1), 0);
      const jCount = nodes.length;
      const lhs = m + r;
      const rhs = 2 * jCount;
      if (lhs !== rhs) {
        const msg = `Truss not determinate: m+r=${lhs}, 2j=${rhs}. Adjust supports or members (need ${rhs - r} members or change support types).`;
        setDeterminacyMsg(msg);
        setStatus('Determinacy check failed.');
        return;
      } else {
        setDeterminacyMsg('');
      }
    }
    // Convert geometry + properties to SI if needed
    const preparedNodes = nodes.map(n => ({ ...n }));
    const preparedBeams = beams.map(b => ({ ...b }));
    let nodesForPayload = preparedNodes;
    let beamsForPayload = preparedBeams;
    if (unitSystem === 'IPS') {
      nodesForPayload = preparedNodes.map(n => ({ ...n, x: n.x * UNIT_FACTORS.IPS.length, y: n.y * UNIT_FACTORS.IPS.length }));
      beamsForPayload = preparedBeams.map(b => {
        const { A, I } = convertSectionToSI(b.A, b.I, 'IPS');
        return { ...b, A, I, E: convertModulusToSI(b.E, 'IPS') };
      });
    }
    // Derive gravity loads from masses (convert to SI first)
    const GRAVITY = 9.80665; // m/s^2
    const gravityLoads = masses.map(m => {
      const nodeId = m.node_id;
      // physical kg
      const massKg = unitSystem === 'IPS' ? m.value * UNIT_FACTORS.IPS.mass : m.value;
      const Fy = -massKg * GRAVITY; // downward
      return { node_id: nodeId, Fx: 0, Fy, Moment: 0 };
    });
  const payload: SimulationInput = { nodes: nodesForPayload, beams: beamsForPayload, loads: gravityLoads, analysis_type: analysisType };
    setStatus('Simulating...');
    try {
      const res = await simulate(payload);
      setResult(res);
      if (gravityLoads.length) {
        setStatus(`Simulation complete. Applied gravity to ${gravityLoads.length} mass${gravityLoads.length !== 1 ? 'es' : ''}.`);
      } else {
        setStatus('Simulation complete.');
      }
    } catch (e: any) {
      setStatus('Simulation error: ' + e.message);
    }
  };

  // Live solvability / guidance checks (runs on each relevant state change)
  React.useEffect(() => {
    if (analysisType === 'truss') {
      const m = beams.length;
      const pins = Array.from(supports.values()).filter(t => t === 'pin').length;
      const rollers = Array.from(supports.values()).filter(t => t === 'roller').length;
      const r = pins * 2 + rollers; // reaction components
      const j = nodes.length;
      let msg = '';
      if (nodes.length === 0) {
        msg = '';
      } else if (pins === 0) {
        msg = 'Add a pin support (provides 2 reactions). Typical determinate base: 1 pin + 1 roller.';
      } else if (pins === 1 && rollers === 0 && j > 1) {
        msg = 'Add a roller support to prevent horizontal drift. (Need 3 total reactions).';
      } else if (pins > 1) {
        msg = 'Too many pins (>=2 gives 4+ reactions). Convert an extra pin to a roller for a determinate base.';
      } else {
        const lhs = m + r;
        const rhs = 2 * j;
        if (lhs !== rhs) {
          if (lhs < rhs) msg = `Truss unstable/underdeterminate: m+r=${lhs} < 2j=${rhs}. Add ${rhs - lhs} member(s) or another reaction.`;
          else msg = `Truss overconstrained: m+r=${lhs} > 2j=${rhs}. Remove ${lhs - rhs} member(s) or reduce a support reaction (convert pin→roller).`;
        }
      }
      setSolvabilityMsg(msg);
    } else { // frame mode heuristic
      // Simple rigid body constraint heuristics
      const constrained = nodes.filter(n => n.constraints); // nodes with any constraints
      let fixX = false, fixY = false, fixRot = false;
      nodes.forEach(n => {
        if (n.constraints?.fix_x) fixX = true;
        if (n.constraints?.fix_y) fixY = true;
        if (n.constraints?.fix_rotation) fixRot = true;
      });
      let msg = '';
      if (nodes.length && (!fixX || !fixY)) {
        msg = 'Frame may translate: need at least one fix_x and one fix_y.';
      }
      if (!msg && nodes.length && !fixRot) {
        msg = 'Frame may freely rotate: add a rotational constraint (pin/roller currently sets rotation fixed).';
      }
      // If only one fully fixed node and no second constraint, warn about possible rotation about that node
      if (!msg && constrained.length === 1 && nodes.length > 2) {
        msg = 'Single support node: structure may spin about it. Add another support.';
      }
      setSolvabilityMsg(msg);
    }
  }, [analysisType, beams, supports, nodes]);

  const clearAll = () => {
  setNodes([]); setBeams([]); setResult(null); setSupports(new Map()); setMasses([]); setPendingBeamStart(null); setStatus('Cleared.');
    setEditingMassId(null); setEditingMassValue('');
  };

  return (
    <div style={{ display: 'flex', fontFamily: 'sans-serif', gap: '1rem' }}>
      <div>
        <h2>Motorcycle Frame Simulator (MVP)</h2>
        <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <fieldset style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
            <legend>Tool</legend>
            {(['node','beam','fixture','mass'] as ToolMode[]).map(m => (
              <label key={m} style={{ marginRight: '0.5rem' }}>
                <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => { setMode(m); setPendingBeamStart(null); }} /> {m}
              </label>
            ))}
          </fieldset>
          <fieldset style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
            <legend>Units</legend>
            {(['KMS','IPS'] as UnitSystem[]).map(u => (
              <label key={u} style={{ marginRight: '0.5rem' }}>
                <input type="radio" name="units" value={u} checked={unitSystem === u} onChange={() => {
                  setNodes(curr => convertNodePositions(curr, unitSystem, u));
                  setBeams(curr => convertBeamProperties(curr, unitSystem, u));
                  setMasses(curr => convertMasses(curr, unitSystem, u));
                  setUnitSystem(u);
                  setStatus(`Switched units to ${u}`);
                }} /> {u}
              </label>
            ))}
          </fieldset>
          <fieldset style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
            <legend>Analysis</legend>
            {(['truss','frame'] as const).map(a => (
              <label key={a} style={{ marginRight: '0.5rem' }}>
                <input type="radio" name="analysis" value={a} checked={analysisType === a} onChange={() => { setAnalysisType(a); setStatus(`Analysis mode: ${a}`); }} /> {a}
              </label>
            ))}
          </fieldset>
          <button onClick={runSimulation} disabled={!nodes.length}>Simulate</button>
          <button onClick={clearAll}>Clear</button>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem' }}>
          Mode tips: node=click empty to add | beam=click start then end node | fixture=toggle support | mass=add lumped mass. Units: KMS=SI, IPS=inch/lbf. Analysis: truss=axial-only pins (rotations ignored), frame=beam bending.
        </div>
        <div style={{ fontSize: '0.9rem', color: '#555' }}>{status}</div>
        {determinacyMsg && (
          <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#b00020', background:'#ffecec', padding:'4px 6px', border:'1px solid #e0a2a2', borderRadius:4 }}>
            {determinacyMsg} Tip: pin=2 reactions, roller=1; required m = 2j - r.
          </div>
        )}
        {solvabilityMsg && !determinacyMsg && (
          <div style={{ marginTop: '0.25rem', fontSize: '0.72rem', color: '#8a4500', background:'#fff4e5', padding:'4px 6px', border:'1px solid #f1c48b', borderRadius:4 }}>
            {solvabilityMsg}
          </div>
        )}
        <FrameCanvas
          nodes={nodes}
          beams={beams}
            result={result}
            mode={mode}
            pendingBeamStart={pendingBeamStart}
            supports={supports}
            masses={new Map(masses.map(m => [m.node_id, (masses.filter(mm => mm.node_id === m.node_id).reduce((a,c)=>a+c.value,0))]))}
            unitSystem={unitSystem}
            onAddNode={addNode}
            onNodeClick={handleNodeClick}
        />
        <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h4 style={{ margin: '0 0 0.25rem' }}>Supports</h4>
            {supports.size === 0 ? <div style={{ fontSize: '0.8rem' }}>None</div> : (
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {Array.from(supports.entries()).map(([nid, t]) => <li key={nid}>{nid}: {t}</li>)}
              </ul>
            )}
            <div style={{ fontSize: '0.65rem', color: '#666', marginTop: '0.25rem' }}>Click cycles: none → pin (fix x,y) → roller (fix y). In truss mode need m + r = 2j.</div>
          </div>
          <div>
            <h4 style={{ margin: '0 0 0.25rem' }}>Masses</h4>
            {masses.length === 0 ? <div style={{ fontSize: '0.8rem' }}>None</div> : (
              <ul style={{ margin: 0, paddingLeft: '1.2rem', maxHeight: 120, overflow: 'auto' }}>
                {masses.map(m => {
                  const isEditing = m.id === editingMassId;
                  const displayUnit = unitSystem === 'IPS' ? 'lbm' : 'kg';
                  // Physical mass in kg for reference
                  const physicalKg = unitSystem === 'IPS' ? m.value * UNIT_FACTORS.IPS.mass : m.value;
                  return (
                    <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <strong>{m.id}</strong>
                      <span>@ {m.node_id}</span>
                      {isEditing ? (
                        <>
                          <input
                            style={{ width: '5rem' }}
                            autoFocus
                            type="number"
                            min={0}
                            step={0.1}
                            value={editingMassValue}
                            onChange={e => setEditingMassValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                commitMassEdit(m.id);
                              } else if (e.key === 'Escape') {
                                cancelMassEdit();
                              }
                            }}
                            onBlur={() => commitMassEdit(m.id)}
                          /> {displayUnit}
                          <button type="button" onClick={() => commitMassEdit(m.id)} style={{ padding: '2px 6px' }}>Save</button>
                          <button type="button" onClick={cancelMassEdit} style={{ padding: '2px 6px' }}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <span>{m.value} {displayUnit}</span>
                          <span style={{ fontSize: '0.7rem', color: '#555' }}>({physicalKg.toFixed(2)} kg)</span>
                          <button type="button" onClick={() => startMassEdit(m)} style={{ padding: '2px 6px' }}>Edit</button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <details style={{ marginTop: '1rem' }}>
          <summary>Structure Data</summary>
          <pre style={{ maxHeight: 200, overflow: 'auto', background: '#f7f7f7', padding: '0.5rem' }}>{JSON.stringify({ unitSystem, nodes, beams, supports: Array.from(supports.entries()), masses, result }, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
};

export default App;

// Helper functions appended below component for clarity
function isFinitePositive(n: number) {
  return Number.isFinite(n) && n >= 0;
}
