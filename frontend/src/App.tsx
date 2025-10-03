import React, { useState } from 'react';
import { FrameCanvas } from './components/FrameCanvas';
import { BeamInput, NodeInput, SimulationInput, SimulationResult, ToolMode, NodeMass, UnitSystem, SupportType, SnapMode, DesignData, DesignListItem } from './types';
import { UNIT_FACTORS, convertNodePositions, convertBeamProperties, getDefaultE, convertModulusToSI, convertSectionToSI, convertMasses } from './units';
import { simulate, saveDesign, listDesigns, loadDesign } from './api';

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
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [snapMode, setSnapMode] = useState<SnapMode>('minor');
  const gridOptionsIPS = [
    { label: '1"', value: 1 },
    { label: '1′ (12")', value: 12 },
    { label: '3′', value: 36 },
    { label: '10′', value: 120 },
    { label: '50′', value: 600 }
  ];
  const gridOptionsKMS = [
    { label: '1 cm', value: 0.01 },
    { label: '50 cm', value: 0.5 },
    { label: '1 m', value: 1 },
    { label: '5 m', value: 5 },
    { label: '10 m', value: 10 }
  ];
  const getGridOptions = () => unitSystem === 'IPS' ? gridOptionsIPS : gridOptionsKMS;
  const [gridSpacing, setGridSpacing] = useState<number>(getGridOptions()[2].value); // default mid option
  const [zoomScale, setZoomScale] = useState<number>(1); // continuous zoom multiplier
  const [panX, setPanX] = useState<number>(0); // model units offset
  const [panY, setPanY] = useState<number>(0);
  // Save / Load UI state
  const [showLoadDialog, setShowLoadDialog] = useState<boolean>(false);
  const [designs, setDesigns] = useState<DesignListItem[] | null>(null);
  const [loadingDesigns, setLoadingDesigns] = useState<boolean>(false);

  const startMassEdit = (m: NodeMass) => {
    setEditingMassId(m.id);
    setEditingMassValue(String(m.value));
  };

  const cancelMassEdit = () => {
    setEditingMassId(null);
    setEditingMassValue('');
  };

  const commitMassEdit = (id: string) => {
    if (editingMassId !== id) return;
    const parsed = parseFloat(editingMassValue);
    if (!isFinite(parsed) || parsed < 0) { setStatus('Mass value must be a non-negative number.'); return; }
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

  const deleteBeam = (beamId: string) => {
    setBeams(prev => prev.filter(b => b.id !== beamId));
    setResult(null);
    setStatus(`Beam ${beamId} deleted.`);
  };

  const removeSupport = (nodeId: string) => {
    setSupports(curr => {
      if (!curr.has(nodeId)) return curr;
      const next = new Map(curr);
      next.delete(nodeId);
      setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, constraints: undefined } : n));
      return next;
    });
    setStatus(`Support removed from ${nodeId}.`);
  };

  const handleNodeClick = (id: string) => {
    if (mode === 'delete') {
      const beamsToRemove = beams.filter(b => b.node_start === id || b.node_end === id).map(b => b.id);
      const massesToRemove = masses.filter(m => m.node_id === id).map(m => m.id);
      const hadSupport = supports.has(id);
      setBeams(prev => prev.filter(b => !beamsToRemove.includes(b.id)));
      setMasses(prev => prev.filter(m => m.node_id !== id));
      setSupports(prev => { if (!hadSupport) return prev; const next = new Map(prev); next.delete(id); return next; });
      setNodes(prev => prev.filter(n => n.id !== id));
      setResult(null);
      setStatus(`Deleted node ${id}${beamsToRemove.length ? ` + ${beamsToRemove.length} beam(s)` : ''}${massesToRemove.length ? ` + ${massesToRemove.length} mass(es)` : ''}${hadSupport ? ' + support' : ''}.`);
      return;
    }
    if (mode === 'beam') {
      if (pendingBeamStart == null) {
        setPendingBeamStart(id);
        setStatus(`Beam start selected: ${id}. Select end node.`);
      } else if (pendingBeamStart === id) {
        setPendingBeamStart(null);
        setStatus('Cancelled beam selection.');
      } else {
        const beamId = `B${beamCounter++}`;
        const defaultE = getDefaultE(unitSystem);
        const defaultA = unitSystem === 'KMS' ? 1e-3 : 0.002;
        const defaultI = unitSystem === 'KMS' ? 1e-6 : 0.004;
        setBeams(prev => [...prev, { id: beamId, node_start: pendingBeamStart!, node_end: id, E: defaultE, I: defaultI, A: defaultA }]);
        setPendingBeamStart(null);
        setStatus(`Beam ${beamId} added.`);
      }
    } else if (mode === 'fixture') {
      setSupports(curr => {
        const next = new Map(curr);
        const currentType = next.get(id);
        let newType: SupportType | undefined;
        if (!currentType) newType = 'pin';
        else if (currentType === 'pin') newType = 'roller';
        else newType = undefined;
        if (newType) next.set(id, newType); else next.delete(id);
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
      const defaultMass = unitSystem === 'KMS' ? 10 : (10 / UNIT_FACTORS.IPS.mass);
      const newMass: NodeMass = { id: massId, node_id: id, value: parseFloat(defaultMass.toFixed(2)) };
      setMasses(prev => [...prev, newMass]);
      const massStatus = unitSystem === 'IPS' ? `${newMass.value} lbm` : `${newMass.value} kg`;
      setStatus(`Mass ${massId} (${massStatus} ~10kg physical) attached to ${id}`);
    }
  };

  // Zoom at cursor maintaining world point and scale continuity across grid level changes
  const zoomAtCursor = (factor: number, screenX: number, screenY: number) => {
    const TARGET_MAJOR_PX = 250;
    const oldMajor = unitSystem === 'IPS' ? gridSpacing : gridSpacing * 5;
    const oldZoom = zoomScale;
    const oldScale = oldMajor > 0 ? (TARGET_MAJOR_PX * oldZoom) / oldMajor : 1; // pixels per unit
    const worldX = screenX / oldScale + panX;
    const worldY = screenY / oldScale + panY;

    let newGrid = gridSpacing;
    let newZoom = oldZoom * factor;
    if (unitSystem === 'IPS') {
      const levels = gridOptionsIPS.map(o => o.value);
      const idx = levels.indexOf(gridSpacing);
      if (newZoom >= 2.0 && idx > 0) {
        const finer = levels[idx - 1];
        // maintain visual scale continuity
        newZoom = newZoom * (finer / gridSpacing);
        newGrid = finer;
      } else if (newZoom <= 0.5 && idx < levels.length - 1) {
        const coarser = levels[idx + 1];
        newZoom = newZoom * (coarser / gridSpacing);
        newGrid = coarser;
      }
    }
    // Clamp zoom
    newZoom = Math.min(20, Math.max(0.05, newZoom));

    if (newGrid !== gridSpacing) setGridSpacing(newGrid);
    setZoomScale(newZoom);

    const newMajor = unitSystem === 'IPS' ? newGrid : newGrid * 5;
    const newScale = newMajor > 0 ? (TARGET_MAJOR_PX * newZoom) / newMajor : oldScale;
    // Adjust pan to keep world point under cursor fixed
    const newPanX = worldX - screenX / newScale;
    const newPanY = worldY - screenY / newScale;
    setPanX(newPanX);
    setPanY(newPanY);
  };

  // Autofit nodes into viewport with padding; adjust grid spacing (IPS) to keep zoomScale moderate
  const autoFit = () => {
    const CANVAS_W = 1600;
    const CANVAS_H = 1000;
    if (!nodes.length) {
      // Reset view
      setPanX(0); setPanY(0); setZoomScale(1); return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(n => { if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x; if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y; });
    // Handle degenerate extents
    if (!isFinite(minX) || !isFinite(minY)) return;
    const spanX = Math.max( maxX - minX, 0.5 );
    const spanY = Math.max( maxY - minY, 0.5 );
    const paddingFactor = 0.15; // 15% padding around
    const targetWidth = spanX * (1 + paddingFactor * 2);
    const targetHeight = spanY * (1 + paddingFactor * 2);
    const scaleForWidth = (0.95 * CANVAS_W) / targetWidth; // 95% of canvas
    const scaleForHeight = (0.90 * CANVAS_H) / targetHeight; // 90% vertical
    let desiredScale = Math.min(scaleForWidth, scaleForHeight);
    // Map desiredScale to (zoomScale, gridSpacing). We'll try to pick a grid spacing so resulting zoomScale is between 0.6 and 1.6
    const TARGET_MAJOR_PX = 250;
    const chooseIPS = () => {
      const levels = gridOptionsIPS.map(o=>o.value);
      let best = {grid: gridSpacing, zoom: 1, diff: Infinity};
      levels.forEach(g => {
        const major = g; // IPS major = gridSpacing
        const z = desiredScale * major / TARGET_MAJOR_PX;
        if (z < 0.3 || z > 3.5) return; // discard extreme
        const diff = Math.abs(z - 1);
        if (diff < best.diff) best = {grid: g, zoom: z, diff};
      });
      return best;
    };
    let newGrid = gridSpacing;
    let newZoom: number;
    if (unitSystem === 'IPS') {
      const pick = chooseIPS();
      newGrid = pick.grid;
      desiredScale = (TARGET_MAJOR_PX * pick.zoom) / newGrid; // adjust if grid changed
      newZoom = pick.zoom;
    } else {
      const major = gridSpacing * 5; // KMS major definition
      newZoom = desiredScale * major / TARGET_MAJOR_PX;
    }
    newZoom = Math.min(20, Math.max(0.05, newZoom));
    if (unitSystem === 'IPS' && newGrid !== gridSpacing) setGridSpacing(newGrid);
    setZoomScale(newZoom);
    const majorFinal = unitSystem === 'IPS' ? newGrid : newGrid * 5;
    const scaleFinal = (TARGET_MAJOR_PX * newZoom) / majorFinal;
    // Center model
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const newPanX = centerX - CANVAS_W / (2 * scaleFinal);
    const newPanY = centerY - CANVAS_H / (2 * scaleFinal);
    setPanX(newPanX);
    setPanY(newPanY);
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

  const buildDesignData = (name: string): DesignData => ({
    name,
    unitSystem,
    analysisType,
    nodes: JSON.parse(JSON.stringify(nodes)),
    beams: JSON.parse(JSON.stringify(beams)),
    supports: Array.from(supports.entries()),
    masses: JSON.parse(JSON.stringify(masses)),
    gridSpacing,
    snapMode,
    zoomScale,
    panX,
    panY,
  });

  const handleSave = async () => {
    const name = window.prompt('Enter design name (letters, numbers, - or _):');
    if (!name) return;
    try {
      const design = buildDesignData(name.trim());
      setStatus('Saving design...');
      await saveDesign(design);
      // Verify it appears in listing
      try {
        const all = await listDesigns();
        if (!all.some(d => d.name === name.trim())) {
          setStatus(`Design '${name}' save attempted, but not found in listing (backend may not be running in correct working directory).`);
        } else {
          setStatus(`Design '${name}' saved.`);
        }
      } catch {
        setStatus(`Design '${name}' saved (listing failed).`);
      }
    } catch (e: any) {
      setStatus('Save failed: ' + e.message);
    }
  };

  const openLoadDialog = async () => {
    setShowLoadDialog(true);
    setLoadingDesigns(true);
    try {
      const items = await listDesigns();
      setDesigns(items);
    } catch (e) {
      setDesigns([]);
    } finally {
      setLoadingDesigns(false);
    }
  };

  const applyLoadedDesign = (d: DesignData) => {
    setUnitSystem(d.unitSystem as UnitSystem);
    setAnalysisType(d.analysisType as 'frame' | 'truss');
    setNodes(d.nodes);
    setBeams(d.beams);
    setSupports(new Map(d.supports));
    setMasses(d.masses);
    setGridSpacing(d.gridSpacing);
    if (d.snapMode) setSnapMode(d.snapMode as SnapMode);
    if (typeof d.zoomScale === 'number') setZoomScale(d.zoomScale);
    if (typeof d.panX === 'number') setPanX(d.panX);
    if (typeof d.panY === 'number') setPanY(d.panY);
    setResult(null);
    setPendingBeamStart(null);
    setEditingMassId(null); setEditingMassValue('');
    // Reset counters to avoid ID collisions
    const nodeNums = d.nodes.map(n => parseInt(n.id.replace(/\D+/g,''))).filter(n => !isNaN(n));
    if (nodeNums.length) nodeCounter = Math.max(...nodeNums) + 1;
    const beamNums = d.beams.map(b => parseInt(b.id.replace(/\D+/g,''))).filter(n => !isNaN(n));
    if (beamNums.length) beamCounter = Math.max(...beamNums) + 1;
    const massNums = d.masses.map(m => parseInt(m.id.replace(/\D+/g,''))).filter(n => !isNaN(n));
    if (massNums.length) massCounter = Math.max(...massNums) + 1;
    setStatus(`Loaded design '${d.name}'.`);
  };

  const handleLoadDesign = async (name: string) => {
    try {
      setStatus('Loading design...');
      const d = await loadDesign(name);
      applyLoadedDesign(d);
      setShowLoadDialog(false);
    } catch (e: any) {
      setStatus('Load failed: ' + e.message);
    }
  };

  return (
    <div style={{ display: 'flex', fontFamily: 'sans-serif', gap: '1rem' }}>
      <div>
        <h2>Motorcycle Frame Simulator (MVP)</h2>
        <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <fieldset style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
            <legend>Tool</legend>
            {(['node','beam','fixture','mass','delete'] as ToolMode[]).map(m => (
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
                  // adjust grid spacing if current invalid for new unit set
                  const opts = u === 'IPS' ? gridOptionsIPS : gridOptionsKMS;
                  if (!opts.some(o => o.value === gridSpacing)) {
                    setGridSpacing(opts[2].value); // choose a representative mid option
                  }
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
          <fieldset style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
            <legend>Grid</legend>
            {['on','off'].map(opt => (
              <label key={opt} style={{ marginRight: '0.5rem' }}>
                <input
                  type="radio"
                  name="grid"
                  value={opt}
                  checked={showGrid === (opt === 'on')}
                  onChange={() => setShowGrid(opt === 'on')}
                /> {opt}
              </label>
            ))}
            {showGrid && (
              <select
                style={{ marginLeft: '0.5rem' }}
                value={gridSpacing}
                onChange={e => setGridSpacing(parseFloat(e.target.value))}
              >
                {getGridOptions().map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
          </fieldset>
          <div style={{ position:'relative' }} />
          <fieldset style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
            <legend>Snap</legend>
            {(['major','minor','fine','free'] as SnapMode[]).map(s => (
              <label key={s} style={{ marginRight: '0.5rem' }}>
                <input
                  type="radio"
                  name="snap"
                  value={s}
                  checked={snapMode === s}
                  onChange={() => setSnapMode(s)}
                /> {s}
              </label>
            ))}
          </fieldset>
          <button onClick={runSimulation} disabled={!nodes.length}>Simulate</button>
          <button onClick={clearAll}>Clear</button>
          <button onClick={handleSave} disabled={!nodes.length}>Save</button>
          <button onClick={openLoadDialog}>Load</button>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem' }}>
          Mode tips: node=click empty to add (ghost preview shows snapped position; hold Alt for free) | beam=click start then end node | fixture=cycle support | mass=add lumped mass | delete=click beam or node (removes attached beams/masses/support). Units: KMS=SI, IPS=inch/lbf. Snap: major/minor/fine/free (Alt overrides to free).
        </div>
        {/* Static message banner area to avoid layout shift */}
        <div style={{minHeight: '70px', display:'flex', flexDirection:'column', gap:'4px'}}>
          <div style={{ fontSize: '0.9rem', color: '#555', lineHeight: '1.2' }}>{status}\u200b</div>
          <div style={{ height:'0px' }} />
          <div style={{ fontSize: '0.75rem' }}>
            {determinacyMsg ? (
              <div style={{ color: '#b00020', background:'#ffecec', padding:'4px 6px', border:'1px solid #e0a2a2', borderRadius:4 }}>
                {determinacyMsg} Tip: pin=2 reactions, roller=1; required m = 2j - r.
              </div>
            ) : solvabilityMsg ? (
              <div style={{ color: '#8a4500', background:'#fff4e5', padding:'4px 6px', border:'1px solid #f1c48b', borderRadius:4 }}>
                {solvabilityMsg}
              </div>
            ) : (
              <div style={{ height: '32px' }} />
            )}
          </div>
        </div>
        <div style={{ position:'relative', display:'inline-block' }}>
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
            onDeleteBeam={deleteBeam}
            showGrid={showGrid}
            gridSpacing={gridSpacing}
            snapMode={snapMode}
            setStatus={setStatus}
            zoomScale={zoomScale}
            panX={panX}
            panY={panY}
            onPanChange={(px,py) => { setPanX(px); setPanY(py); }}
            onZoomAtCursor={(factor, sx, sy) => zoomAtCursor(factor, sx, sy)}
          />
          {/* Overlay controls (zoom + pan) */}
          <div style={{ pointerEvents:'none' }}>
            <div style={{ position:'absolute', bottom:12, right:12, display:'flex', flexDirection:'column', gap:6, pointerEvents:'auto' }}>
              <button aria-label="Autofit" title="Autofit (A)" style={{ width:34, height:34, fontSize:14, fontWeight:600 }} onClick={() => autoFit()}>A</button>
              <button aria-label="Zoom In" style={{ width:34, height:34, fontSize:18 }} onClick={() => zoomAtCursor(1.2, 800, 500)}>+</button>
              <button aria-label="Zoom Out" style={{ width:34, height:34, fontSize:18 }} onClick={() => zoomAtCursor(1/1.2, 800, 500)}>-</button>
            </div>
            {/* Pan buttons */}
            {(() => {
              const stepBase = (unitSystem === 'IPS' ? gridSpacing : gridSpacing * 5) / 2; // half a major spacing
              const step = stepBase / zoomScale; // keep roughly constant on screen
              return (
                <>
                  <button aria-label="Pan Up" style={{ position:'absolute', top:8, left:'50%', transform:'translateX(-50%)', width:36, height:30, pointerEvents:'auto' }} onClick={() => setPanY(p => p - step)}>▲</button>
                  <button aria-label="Pan Down" style={{ position:'absolute', bottom:8, left:'50%', transform:'translateX(-50%)', width:36, height:30, pointerEvents:'auto' }} onClick={() => setPanY(p => p + step)}>▼</button>
                  <button aria-label="Pan Left" style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', width:30, height:36, pointerEvents:'auto' }} onClick={() => setPanX(p => p - step)}>◀</button>
                  <button aria-label="Pan Right" style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', width:30, height:36, pointerEvents:'auto' }} onClick={() => setPanX(p => p + step)}>▶</button>
                </>
              );
            })()}
          </div>
        </div>
        {showLoadDialog && (
          <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={() => setShowLoadDialog(false)}>
            <div style={{ background:'#fff', padding:'1rem', borderRadius:8, minWidth:360, maxHeight:'70vh', overflow:'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem' }}>
                <h3 style={{ margin:0 }}>Load Design</h3>
                <button onClick={() => setShowLoadDialog(false)}>✕</button>
              </div>
              {loadingDesigns && <div>Loading list...</div>}
              {!loadingDesigns && designs && designs.length === 0 && <div style={{ fontSize:'0.85rem' }}>No designs saved yet.</div>}
              {!loadingDesigns && designs && designs.length > 0 && (
                <ul style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:'0.35rem' }}>
                  {designs.map(d => (
                    <li key={d.name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #ddd', padding:'0.4rem 0.6rem', borderRadius:4 }}>
                      <div style={{ display:'flex', flexDirection:'column' }}>
                        <strong>{d.name}</strong>
                        <span style={{ fontSize:'0.65rem', color:'#555' }}>{new Date(d.modified * 1000).toLocaleString()}</span>
                      </div>
                      <button style={{ padding:'4px 10px' }} onClick={() => handleLoadDesign(d.name)}>Load</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h4 style={{ margin: '0 0 0.25rem' }}>Supports</h4>
            {supports.size === 0 ? <div style={{ fontSize: '0.8rem' }}>None</div> : (
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {Array.from(supports.entries()).map(([nid, t]) => <li key={nid}>{nid}: {t} <button style={{ marginLeft: 4, fontSize: '0.65rem' }} onClick={() => removeSupport(nid)}>x</button></li>)}
              </ul>
            )}
            <div style={{ fontSize: '0.65rem', color: '#666', marginTop: '0.25rem' }}>Click cycles: none → pin (fix x,y) → roller (fix y). In truss mode need m + r = 2j.</div>
          </div>
          <div>
            <h4 style={{ margin: '0 0 0.25rem' }}>Beams</h4>
            {beams.length === 0 ? <div style={{ fontSize: '0.8rem' }}>None</div> : (
              <ul style={{ margin: 0, paddingLeft: '1.2rem', maxHeight: 120, overflow: 'auto' }}>
                {beams.map(b => {
                  const nStart = nodes.find(n => n.id === b.node_start);
                  const nEnd = nodes.find(n => n.id === b.node_end);
                  let lengthStr = '';
                  if (nStart && nEnd) {
                    const dx = nEnd.x - nStart.x; const dy = nEnd.y - nStart.y;
                    const L = Math.hypot(dx, dy);
                    const unit = unitSystem === 'IPS' ? 'in' : 'm';
                    lengthStr = L.toFixed(2) + ' ' + unit;
                  }
                  return (
                    <li key={b.id} style={{ fontSize: '0.8rem', display:'flex', gap:'0.4rem', alignItems:'center', flexWrap:'wrap' }}>
                      <strong>{b.id}</strong>
                      <span>{b.node_start}→{b.node_end}</span>
                      {lengthStr && <span style={{ color:'#555' }}>({lengthStr})</span>}
                      <button style={{ fontSize:'0.6rem', padding:'2px 4px' }} onClick={() => deleteBeam(b.id)}>del</button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div style={{ fontSize: '0.65rem', color:'#666', marginTop:'0.25rem' }}>Delete via this list (del) or beam tool delete mode.</div>
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
