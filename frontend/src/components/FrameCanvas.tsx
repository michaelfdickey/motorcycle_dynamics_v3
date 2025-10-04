import React, { useRef } from 'react';
import { BeamInput, NodeInput, SimulationResult, ToolMode, UnitSystem, SupportType, SnapMode, BeamSection } from '../types';
import { UNIT_FACTORS } from '../units';

interface Props {
  nodes: NodeInput[];
  beams: BeamInput[];
  result?: SimulationResult | null;
  mode: ToolMode;
  pendingBeamStart: string | null;
  supports: Map<string, SupportType>; // node id -> support type
  masses: Map<string, number>; // node_id -> total mass
  unitSystem?: UnitSystem;
  onAddNode: (x: number, y: number) => void;
  onNodeClick: (id: string) => void; // context dependent on mode
  onDeleteBeam?: (id: string) => void; // only used in delete mode
  showGrid?: boolean;
  gridSpacing?: number; // spacing in current display units
  snapMode?: SnapMode;
  setStatus?: (s: string) => void;
  zoomScale?: number;
  panX?: number;
  panY?: number;
  onPanChange?: (px: number, py: number) => void;
  onZoomAtCursor?: (factor: number, screenX: number, screenY: number, rect: DOMRect, deltaY: number) => void;
  showDimensions?: boolean; // show beam lengths & joint angles
  showForces?: boolean; // show force vectors & components
  showStress?: boolean; // color beams by tension utilization
}

const DISP_SCALE = 200; // exaggeration factor for displacement visualization

export const FrameCanvas: React.FC<Props> = ({ nodes, beams, result, mode, pendingBeamStart, supports, masses, unitSystem = 'KMS', onAddNode, onNodeClick, onDeleteBeam, showGrid = false, gridSpacing = 50, snapMode = 'free', setStatus, zoomScale = 1, panX = 0, panY = 0, onPanChange, onZoomAtCursor, showDimensions = false, showForces = false, showStress = false }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverPoint, setHoverPoint] = React.useState<{x:number,y:number}|null>(null);
  const [panning, setPanning] = React.useState(false);
  const panStartRef = React.useRef<{clientX:number; clientY:number; panX:number; panY:number} | null>(null);
  const spaceDownRef = React.useRef(false);

  // Wheel zoom listener (non-passive) to suppress page scroll while zooming canvas
  React.useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheelInternal = (e: WheelEvent) => {
      if (!onZoomAtCursor) return;
      // Only intercept if meta/ctrl not pressed (allow browser zoom shortcuts)
      if (e.ctrlKey) return; // let pinch-to-zoom / browser gesture pass
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.15 : 1/1.15;
      onZoomAtCursor(factor, e.clientX - rect.left, e.clientY - rect.top, rect as DOMRect, e.deltaY);
    };
    el.addEventListener('wheel', onWheelInternal, { passive: false });
    return () => { el.removeEventListener('wheel', onWheelInternal); };
  }, [onZoomAtCursor, zoomScale, panX, panY, gridSpacing, unitSystem]);

  // Track spacebar globally for space-drag panning
  React.useEffect(() => {
    const keyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') { if (!spaceDownRef.current) { spaceDownRef.current = true; e.preventDefault(); } }
    };
    const keyUp = (e: KeyboardEvent) => { if (e.code === 'Space') { spaceDownRef.current = false; } };
    window.addEventListener('keydown', keyDown, { passive: false });
    window.addEventListener('keyup', keyUp);
    return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); };
  }, []);

  // Dynamic scale so that one major grid spacing maps to a target pixel length.
  const TARGET_MAJOR_PX = 250; // desired pixel width of one major spacing (baseline)
  const majorSpacingUnits = unitSystem === 'IPS' ? gridSpacing : gridSpacing * 5;
  const SCALE = majorSpacingUnits > 0 ? (TARGET_MAJOR_PX * zoomScale) / majorSpacingUnits : 1;

  const computeMinorSpacing = (): number => {
    if (!gridSpacing) return 1;
    if (unitSystem === 'IPS') {
      const g = gridSpacing;
      const eps = 1e-6;
      if (Math.abs(g - 1) < eps) return 0.125;
      if (Math.abs(g - 12) < eps) return 1;
      if (Math.abs(g - 36) < eps) return 6;
      if (Math.abs(g - 120) < eps) return 12;
      if (Math.abs(g - 600) < eps) return 60;
      return g / 5;
    }
    return gridSpacing; // KMS
  };

  const getSnapStep = (): number => {
    if (snapMode === 'free') return 0; // no snapping
    const minor = computeMinorSpacing();
    const major = unitSystem === 'IPS' ? gridSpacing! : gridSpacing! * 5;
    if (snapMode === 'major') return major;
    if (snapMode === 'minor') return minor;
    if (snapMode === 'fine') {
      return minor / (unitSystem === 'IPS' ? 8 : 10);
    }
    return 0;
  };

  const snapCoords = (clientX:number, clientY:number, altKey:boolean) => {
    const rect = svgRef.current!.getBoundingClientRect();
  let x = (clientX - rect.left) / SCALE + panX;
  let y = (clientY - rect.top) / SCALE + panY;
    const step = altKey ? 0 : getSnapStep();
    if (step > 0) {
      x = Math.round(x / step) * step;
      y = Math.round(y / step) * step;
    }
    return {x,y, step};
  };

  const beginPan = (e: React.MouseEvent) => {
    if (!svgRef.current || !(e.button === 1 || (e.button === 0 && spaceDownRef.current))) return false;
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    panStartRef.current = { clientX: e.clientX, clientY: e.clientY, panX, panY };
    setPanning(true);
    return true;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (beginPan(e)) return; // don't start node add
    // Otherwise proceed normally (e.g., node add handled by click)
  };

  const handleMouseMovePan = (e: React.MouseEvent) => {
    if (!panning || !panStartRef.current || !onPanChange) return;
    const { clientX, clientY, panX: startX, panY: startY } = panStartRef.current;
    const dxScreen = e.clientX - clientX;
    const dyScreen = e.clientY - clientY;
    const dxModel = dxScreen / SCALE;
    const dyModel = dyScreen / SCALE;
    // Drag direction: moving mouse right should move content with cursor (paper grab)
    onPanChange(startX - dxModel, startY - dyModel);
  };

  const endPan = () => { setPanning(false); panStartRef.current = null; };

  const handleClick = (e: React.MouseEvent) => {
    if (panning) return; // suppress click action after pan
    if (mode !== 'node') return; // only add nodes in node mode
    if (!svgRef.current) return;
    const {x,y,step} = snapCoords(e.clientX, e.clientY, e.altKey);
    const xs = parseFloat(x.toFixed(5));
    const ys = parseFloat(y.toFixed(5));
    onAddNode(xs, ys);
    if (setStatus) setStatus(`Node added at (${xs.toFixed(3)}, ${ys.toFixed(3)})${step>0 && !e.altKey? ` snapped (${snapMode})`: e.altKey? ' (free override)':''}`);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (mode !== 'node' || !svgRef.current) { setHoverPoint(null); return; }
    const {x,y} = snapCoords(e.clientX, e.clientY, e.altKey);
    setHoverPoint({x, y});
  };

  const handleMouseLeave = () => setHoverPoint(null);

  const displacementMap = new Map<string, { ux: number; uy: number }>();
  if (result) {
    result.displacements.forEach(d => displacementMap.set(d.id, { ux: d.ux, uy: d.uy }));
  }

  // Precompute tension utilization ratios (tension only) for coloring when showStress enabled.
  const tensionUtilization = new Map<string, number>(); // beam.id -> ratio (>=0)
  if (showStress && result) {
    result.internal_forces.forEach(f => {
      const beam = beams.find(b => b.id === f.id);
      if (!beam) return;
      const section: BeamSection | undefined = (beam as any).section;
      if (!section) return;
      const area = section.area_in2;
      const fy = section.yield_strength_psi; // psi
      if (!area || !fy || area <= 0 || fy <= 0) return;
      const displayAxial = -f.axial; // invert so + = tension in UI convention
      if (displayAxial <= 0) return; // only tension members
      const axial_lbs = displayAxial / UNIT_FACTORS.IPS.force; // N -> lbf
      const ratio = Math.abs(axial_lbs) / (fy * area);
      tensionUtilization.set(beam.id, ratio);
    });
  }

  // Compression (buckling) utilization map using Euler with knockdown phi=0.9 (only if stress overlay enabled)
  const compressionUtilization = new Map<string, number>(); // beam.id -> ratio
  if (showStress && result) {
    const PHI = 0.9; // knockdown factor
    const K = 1.0;   // effective length factor (pinned-pinned)
    result.internal_forces.forEach(f => {
      const beam = beams.find(b => b.id === f.id); if (!beam) return;
      const section: BeamSection | undefined = (beam as any).section; if (!section) return;
      const I = section.I_in4; const E = section.E_psi || 29_000_000; // psi & in^4
      if (!I || I <= 0 || !E || E <= 0) return;
      const n1 = nodes.find(n => n.id === beam.node_start); const n2 = nodes.find(n => n.id === beam.node_end); if (!n1 || !n2) return;
      const displayAxial = -f.axial; // invert sign: + tension, - compression? (Earlier: + tension, so compression => displayAxial < 0)
      if (displayAxial >= 0) return; // we only want compression members
      const axial_lbs = Math.abs(displayAxial) / UNIT_FACTORS.IPS.force; // compression magnitude in lbf
      // Length in inches
      const dx = n2.x - n1.x; const dy = n2.y - n1.y; let L = Math.hypot(dx, dy);
      if (L <= 1e-6) return;
      if (unitSystem === 'KMS') { L *= 39.37007874; } // meters -> inches
      const KL = K * L;
      const Pcr = (Math.PI * Math.PI * E * I) / (KL * KL); // lbf
      if (Pcr <= 0) return;
      const util = axial_lbs / (PHI * Pcr);
      compressionUtilization.set(beam.id, util);
    });
  }

  const lerp = (a:number,b:number,t:number)=> a + (b-a)*t;
  const toHex = (v:number)=> ('0'+Math.round(Math.min(255, Math.max(0,v))).toString(16)).slice(-2);
  const stressColor = (ratio:number) => {
    if (ratio <= 0) return '#00a651';
    const r = Math.min(ratio, 1); // clamp
    let R:number,G:number,B:number;
    // 0 -> 0.5: green (#00a651 ~ rgb(0,166,81)) to yellow (#ffd600 rgb(255,214,0))
    // 0.5 -> 1: yellow to red (#d50000 rgb(213,0,0))
    if (r <= 0.5) {
      const t = r / 0.5;
      R = lerp(0, 255, t);
      G = lerp(166, 214, t);
      B = lerp(81, 0, t);
    } else {
      const t = (r - 0.5) / 0.5;
      R = lerp(255, 213, t);
      G = lerp(214, 0, t);
      B = lerp(0, 0, t);
    }
    return '#' + toHex(R) + toHex(G) + toHex(B);
  };

  return (
    <svg
      ref={svgRef}
  width={1920}
  height={1000}
      style={{ border: '1px solid #888', background: '#fff', maxWidth: '100%', height: 'auto', cursor: panning ? 'grabbing' : (spaceDownRef.current ? 'grab' : 'default'), overscrollBehavior: 'contain', touchAction: 'none' }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={(e) => { handleMouseMove(e); handleMouseMovePan(e); }}
      onMouseUp={endPan}
      onMouseLeave={() => { handleMouseLeave(); endPan(); }}
    >
      {showGrid && gridSpacing > 0 && (
        <g pointerEvents="none">
          {(() => {
            const lines: JSX.Element[] = [];
            const width = 1920; // viewport px width
            const height = 1000; // viewport px height
            const eps = 1e-6;
            let minor: number; let major: number;
            if (unitSystem === 'IPS') {
              major = gridSpacing;
              if (Math.abs(gridSpacing - 1) < eps) minor = 0.125;
              else if (Math.abs(gridSpacing - 12) < eps) minor = 1;
              else if (Math.abs(gridSpacing - 36) < eps) minor = 6;
              else if (Math.abs(gridSpacing - 120) < eps) minor = 12;
              else if (Math.abs(gridSpacing - 600) < eps) minor = 60;
              else minor = gridSpacing / 5;
            } else {
              minor = gridSpacing;
              major = gridSpacing * 5;
            }
            const startX = panX;
            const endX = panX + width / SCALE;
            const startY = panY;
            const endY = panY + height / SCALE;
            const estLines = ((endX - startX) / minor) + ((endY - startY) / minor);
            const MAX_LINES = 20000;
            let stride = 1;
            if (estLines > MAX_LINES) stride = Math.ceil(estLines / MAX_LINES);
            const firstX = Math.floor(startX / minor) * minor;
            const firstY = Math.floor(startY / minor) * minor;
            let idx = 0;
            for (let x = firstX; x <= endX + eps; x += minor) {
              if ((idx++ % stride) !== 0) continue;
              const isMajor = Math.abs((x / major) - Math.round(x / major)) < 1e-6;
              const xs = (x - panX) * SCALE;
              lines.push(<line key={'gx'+x.toFixed(5)} x1={xs} y1={0} x2={xs} y2={height} stroke={isMajor ? '#cfcfcf' : '#f3f3f3'} strokeWidth={isMajor ? 1 : 0.4} />);
            }
            idx = 0;
            for (let y = firstY; y <= endY + eps; y += minor) {
              if ((idx++ % stride) !== 0) continue;
              const isMajor = Math.abs((y / major) - Math.round(y / major)) < 1e-6;
              const ys = (y - panY) * SCALE;
              lines.push(<line key={'gy'+y.toFixed(5)} x1={0} y1={ys} x2={width} y2={ys} stroke={isMajor ? '#cfcfcf' : '#f3f3f3'} strokeWidth={isMajor ? 1 : 0.4} />);
            }
            return lines;
          })()}
        </g>
      )}
      <g transform={`translate(${-panX * SCALE}, ${-panY * SCALE})`}>
      {/* Undeformed beams with optional section thickness. For round tubes we now render an explicit pill path (two semicircles + body) */}
      {beams.map(b => {
        const n1 = nodes.find(n => n.id === b.node_start);
        const n2 = nodes.find(n => n.id === b.node_end);
        if (!n1 || !n2) return null;
  const deletable = mode === 'delete';
  let beamColor = deletable ? '#aa0000' : '#666'; // default base color
        if (!deletable && showStress) {
          let rUtil = tensionUtilization.get(b.id);
          if (rUtil === undefined) {
            rUtil = compressionUtilization.get(b.id);
          }
          if (rUtil !== undefined) {
            beamColor = stressColor(rUtil);
          }
        }
        const section: BeamSection | undefined = (b as any).section;
  // Determine physical outer size (inches) then convert to current model units.
        let outerIn = 0;
        if (section) {
          if (section.shape === 'round_tube' && section.outer_diameter_in) outerIn = section.outer_diameter_in;
          else if (section.shape === 'square_tube' && section.outer_width_in) outerIn = section.outer_width_in;
        }
        // Convert inches to model units if needed
        let outerModel = outerIn;
        if (outerIn > 0 && unitSystem === 'KMS') outerModel = outerIn * 0.0254; // inches -> meters
  // Visual scaling: 1" tube in IPS occupies exactly 1 model unit; stroke width = physical OD/width * SCALE (no artificial cap to preserve true proportion).
  const thicknessPx = outerModel > 0 ? Math.max(1, outerModel * SCALE) : 2;
        const x1 = n1.x * SCALE; const y1 = n1.y * SCALE; const x2 = n2.x * SCALE; const y2 = n2.y * SCALE;
        const dx = x2 - x1; const dy = y2 - y1; const Lpx = Math.hypot(dx, dy) || 1;
        const ux = dx / Lpx; const uy = dy / Lpx;
        const r = thicknessPx / 2;
        // Determine if we should render round tube ends. Some material entries may have outer_diameter_in populated
        // even if shape string mismatches; treat presence of outer_diameter_in (and absence of outer_width_in) as round fallback.
  // Robust round detection (case-insensitive + fallback on presence of outer_diameter_in)
  const shapeVal = section?.shape?.toLowerCase();
  const isRound = !!section && (shapeVal === 'round_tube' || (shapeVal?.includes('round') ?? false) || (!!section.outer_diameter_in && !section.outer_width_in));
        if (section && !(section.shape === 'round_tube') && section.outer_diameter_in && !section.outer_width_in) {
          // Debug once per beam: fallback path triggered.
          // (This will appear in browser console to confirm cause 1 was shape mismatch.)
          // eslint-disable-next-line no-console
          console.debug('Round fallback engaged for beam', b.id, 'shape=', section.shape, 'OD=', section.outer_diameter_in);
        }
        // For round tubes: emulate outward half-caps by shortening line and drawing full circles under it at node centers.
        if (isRound) {
          const rpx = thicknessPx / 2;
          if (Lpx < 1e-3) return null;
          if (Lpx <= thicknessPx * 0.2) {
            return <circle key={b.id+"-pill-short"} cx={x1} cy={y1} r={rpx} fill={beamColor} stroke={deletable? '#550000':'#222'} strokeWidth={0.75} data-beamid={b.id} />;
          }
          const pxn = -uy; const pyn = ux; // perpendicular
          const startTopX = x1 + pxn * rpx; const startTopY = y1 + pyn * rpx;
          const endTopX = x2 + pxn * rpx; const endTopY = y2 + pyn * rpx;
          const endBotX = x2 - pxn * rpx; const endBotY = y2 - pyn * rpx;
          const startBotX = x1 - pxn * rpx; const startBotY = y1 - pyn * rpx;
          // Capsule path: top edge start->end, arc around end, bottom edge back, arc around start
          // Use sweep-flag=1 to arc the outer semicircle direction.
          const rCmd = rpx;
          const d = [
            `M ${startTopX} ${startTopY}`,
            `L ${endTopX} ${endTopY}`,
            `A ${rCmd} ${rCmd} 0 0 1 ${endBotX} ${endBotY}`,
            `L ${startBotX} ${startBotY}`,
            `A ${rCmd} ${rCmd} 0 0 1 ${startTopX} ${startTopY}`,
            'Z'
          ].join(' ');
          return <path key={b.id+"-pill"} d={d} fill={beamColor} stroke={deletable? '#550000':'#222'} strokeWidth={0.75} data-beamid={b.id} style={deletable ? { cursor: 'pointer' } : undefined} onClick={e => { if (deletable && onDeleteBeam) { e.stopPropagation(); onDeleteBeam(b.id); } }} />;
        }
        // Square/untyped - keep stroke representation
        return <line key={b.id+'-line'} x1={x1} y1={y1} x2={x2} y2={y2} stroke={beamColor} strokeWidth={thicknessPx} strokeLinecap="butt" data-beamid={b.id} style={deletable ? { cursor: 'pointer' } : undefined} onClick={e => { if (deletable && onDeleteBeam) { e.stopPropagation(); onDeleteBeam(b.id); } }} />;
      })}
      {/* Beam length dimensions (optional) */}
      {showDimensions && beams.map(b => {
        const n1 = nodes.find(n => n.id === b.node_start);
        const n2 = nodes.find(n => n.id === b.node_end);
        if (!n1 || !n2) return null;
        const dx = n2.x - n1.x; const dy = n2.y - n1.y;
        const L = Math.hypot(dx, dy);
        if (L < 1e-6) return null;
        // Skip extremely short beams to reduce clutter (threshold in model units)
        const minDisplay = unitSystem === 'IPS' ? 0.25 : 0.01;
        if (L < minDisplay) return null;
        const mx = (n1.x + n2.x) / 2; const my = (n1.y + n2.y) / 2;
        // Perpendicular offset (world units) for dimension line
        const offsetPx = 18; // screen space
        const offWorld = offsetPx / SCALE;
        const nx = -dy / L; const ny = dx / L;
        const ox = nx * offWorld; const oy = ny * offWorld;
        // Endpoints for offset dimension line (slightly inset from real ends)
        const inset = Math.min(L * 0.05, 0.4); // world
        const ix1 = n1.x + (dx / L) * inset + ox;
        const iy1 = n1.y + (dy / L) * inset + oy;
        const ix2 = n2.x - (dx / L) * inset + ox;
        const iy2 = n2.y - (dy / L) * inset + oy;
        const sx1 = ix1 * SCALE; const sy1 = iy1 * SCALE; const sx2 = ix2 * SCALE; const sy2 = iy2 * SCALE;
        const ex1 = n1.x * SCALE; const ey1 = n1.y * SCALE; const ex2 = n2.x * SCALE; const ey2 = n2.y * SCALE;
        // Format length
        let label: string;
        if (unitSystem === 'IPS') {
          label = L.toFixed(L >= 100 ? 0 : L >= 10 ? 1 : 2) + ' in';
        } else {
          label = (L >= 1 ? L.toFixed(2) : (L*100).toFixed(1)+' cm');
        }
        // Arrow heads (simple lines)
        const arrowSize = 6;
        const ux = dx / L; const uy = dy / L;
        const ax1x = sx1 + ux * arrowSize; const ax1y = sy1 + uy * arrowSize;
        const ax2x = sx2 - ux * arrowSize; const ax2y = sy2 - uy * arrowSize;
        return (
          <g key={b.id + '-dim'} stroke="#2d6a4f" strokeWidth={1} fill="none" pointerEvents="none">
            {/* Extension lines */}
            <line x1={ex1} y1={ey1} x2={sx1} y2={sy1} stroke="#2d6a4f" strokeDasharray="2 3" />
            <line x1={ex2} y1={ey2} x2={sx2} y2={sy2} stroke="#2d6a4f" strokeDasharray="2 3" />
            {/* Dimension line */}
            <line x1={sx1} y1={sy1} x2={sx2} y2={sy2} />
            {/* Arrows */}
            <line x1={sx1} y1={sy1} x2={ax1x} y2={ax1y} />
            <line x1={sx2} y1={sy2} x2={ax2x} y2={ax2y} />
            <text x={mx * SCALE + ox * SCALE} y={my * SCALE + oy * SCALE - 3} fontSize={12} fill="#2d6a4f" textAnchor="middle" fontFamily="monospace" stroke="#fff" strokeWidth={2} paintOrder="stroke">{label}</text>
          </g>
        );
      })}
      {/* Joint angle dimensions (unique acute/right angles only) */}
      {showDimensions && (() => {
        const elems: JSX.Element[] = [];
        const shownKey = new Set<string>();
        const ACUTE_LIMIT = 90.5; // degrees inclusive with small tolerance
        nodes.forEach(n => {
          const connected = beams.filter(b => b.node_start === n.id || b.node_end === n.id);
          if (connected.length < 2 || connected.length > 6) return; // skip overly busy for clarity
          // Build vectors
          const vecs = connected.map(b => {
            const otherId = b.node_start === n.id ? b.node_end : b.node_start;
            const other = nodes.find(nd => nd.id === otherId);
            if (!other) return null;
            const dx = other.x - n.x; const dy = other.y - n.y; const L = Math.hypot(dx, dy);
            if (L < 1e-6) return null;
            return { b, dx, dy, L };
          }).filter(Boolean) as {b:BeamInput; dx:number; dy:number; L:number}[];
          for (let i=0;i<vecs.length;i++) {
            for (let j=i+1;j<vecs.length;j++) {
              const v1 = vecs[i]; const v2 = vecs[j];
              // Unordered key to avoid duplicates
              const key = [n.id, v1.b.id, v2.b.id].sort().join('-');
              if (shownKey.has(key)) continue;
              const dot = v1.dx * v2.dx + v1.dy * v2.dy;
              const cos = dot / (v1.L * v2.L);
              const clamped = Math.min(1, Math.max(-1, cos));
              let ang = Math.acos(clamped); // 0..pi
              let deg = ang * 180 / Math.PI;
              if (deg < 2 || deg > ACUTE_LIMIT) continue; // only acute or right; skip very small (~collinear) and obtuse
              shownKey.add(key);
              // Determine consistent start angle & sweep direction (shortest arc)
              const a1 = Math.atan2(v1.dy, v1.dx);
              const a2 = Math.atan2(v2.dy, v2.dx);
              let diff = a2 - a1;
              while (diff <= -Math.PI) diff += 2*Math.PI;
              while (diff > Math.PI) diff -= 2*Math.PI;
              let start = a1; let sweep = diff;
              if (sweep < 0) { start = a2; sweep = -diff; }
              if (sweep > Math.PI) sweep = 2*Math.PI - sweep; // ensure acute path
              // Arc radius heuristic based on shorter member
              const minLen = Math.min(v1.L, v2.L);
              const rWorld = Math.min(Math.max(minLen * 0.28, unitSystem==='IPS'?0.4:0.08), unitSystem==='IPS'?4:1.0);
              const rPx = rWorld * SCALE;
              if (rPx < 10) continue;
              const steps = Math.max(6, Math.floor(sweep * 20));
              const pts: string[] = [];
              for (let s=0;s<=steps;s++) {
                const t = s/steps;
                const angCur = start + sweep * t;
                pts.push(`${(n.x + Math.cos(angCur)*rWorld)*SCALE},${(n.y + Math.sin(angCur)*rWorld)*SCALE}`);
              }
              const labelDeg = (Math.round(deg*10)/10).toFixed(1) + '°';
              const midAng = start + sweep/2;
              const lx = (n.x + Math.cos(midAng)*(rWorld + 6 / SCALE)) * SCALE;
              const ly = (n.y + Math.sin(midAng)*(rWorld + 6 / SCALE)) * SCALE;
              elems.push(
                <g key={key} pointerEvents="none">
                  <polyline points={pts.join(' ')} fill="none" stroke="#6a4c93" strokeWidth={1} />
                  <text x={lx} y={ly} fontSize={11} fill="#6a4c93" textAnchor="middle" fontFamily="monospace" stroke="#fff" strokeWidth={2} paintOrder="stroke">{labelDeg}</text>
                </g>
              );
            }
          }
        });
        return elems;
      })()}
      {/* Deformed shape */}
      {result && beams.map(b => {
        const n1 = nodes.find(n => n.id === b.node_start);
        const n2 = nodes.find(n => n.id === b.node_end);
        if (!n1 || !n2) return null;
        const d1 = displacementMap.get(n1.id) || { ux: 0, uy: 0 };
        const d2 = displacementMap.get(n2.id) || { ux: 0, uy: 0 };
  return <line key={b.id + '-def'} x1={(n1.x + d1.ux * DISP_SCALE) * SCALE} y1={(n1.y + d1.uy * DISP_SCALE) * SCALE} x2={(n2.x + d2.ux * DISP_SCALE) * SCALE} y2={(n2.y + d2.uy * DISP_SCALE) * SCALE} stroke="#e63946" strokeWidth={2} strokeDasharray="4 4" />;
      })}
      {/* Axial force labels (always display in lbs for user clarity) */}
      {result && result.internal_forces.map(f => {
        const beam = beams.find(b => b.id === f.id);
        if (!beam) return null;
        const n1 = nodes.find(n => n.id === beam.node_start);
        const n2 = nodes.find(n => n.id === beam.node_end);
        if (!n1 || !n2) return null;
        const mx = (n1.x + n2.x) / 2 * SCALE;
        const my = (n1.y + n2.y) / 2 * SCALE;
        // User-requested sign reversal: treat original + (solver tension) as compression visually.
        // Flip sign for display only.
        const displayAxial = -f.axial; // invert
        const axial_lbs = displayAxial / UNIT_FACTORS.IPS.force; // convert N -> lbf (after inversion)
        const isTension = displayAxial > 0; // now + means tension in UI (original solver compression)
        const color = isTension ? '#d62828' : '#003049';
        const label = `${isTension ? 'T' : 'C'} ${Math.abs(axial_lbs).toFixed(1)} lb`;
        // Tension stress utilization (only for tension beams with section data)
        let ratioElem: JSX.Element | null = null;
        let bucklingElem: JSX.Element | null = null;
        if (isTension && (beam as any).section) {
          const section: BeamSection | undefined = (beam as any).section;
          const area = section?.area_in2; // square inches
          const fy = section?.yield_strength_psi; // psi
          if (area && fy && area > 0 && fy > 0) {
            // axial_lbs already in lbf. stress ratio = Force / (Fy * Area)
            const ratio = Math.abs(axial_lbs) / (fy * area); // dimensionless
            // Place ratio slightly below existing force label to reduce overlap; also shift perpendicular to beam if possible.
            // Compute a perpendicular offset using beam direction.
            const dx = (n2.x - n1.x); const dy = (n2.y - n1.y);
            const L = Math.hypot(dx, dy) || 1;
            const nxp = -dy / L; const nyp = dx / L; // unit perpendicular
            const offsetScreen = 14; // px away from force label
            const rx = mx + nxp * offsetScreen;
            const ry = my + nyp * offsetScreen;
            ratioElem = (
              <text key={f.id + '-ratio'} x={rx} y={ry + 10} fontSize={12} fill={ratio >= 0.9 ? '#b91c1c' : ratio >= 0.7 ? '#d97706' : '#065f46'}
                    stroke="#fff" strokeWidth={2} paintOrder="stroke" textAnchor="middle" fontFamily="monospace">
                {ratio.toFixed(ratio >= 0.995 ? 2 : 3)}
              </text>
            );
          }
        } else if (!isTension && (beam as any).section) {
          // Compression: Euler buckling utilization with knockdown 0.9
          const section: BeamSection | undefined = (beam as any).section;
          const E = section?.E_psi || 29_000_000; // psi
          const I = section?.I_in4; // in^4
          if (E > 0 && I && I > 0) {
            // Beam length in inches
            const dxw = n2.x - n1.x; const dyw = n2.y - n1.y;
            const L_world = Math.hypot(dxw, dyw); // model units (in or m)
            let L_in = L_world;
            if (unitSystem === 'KMS') {
              L_in = L_world * 39.37007874; // meters -> inches
            }
            if (L_in > 1e-6) {
              const K = 1.0; // pinned-pinned baseline
              const phi = 0.9; // knockdown factor
              const Pcr = (Math.PI * Math.PI * E * I) / ((K * L_in) * (K * L_in)); // lbf (consistent units)
              if (Pcr > 0) {
                const compForce = Math.abs(axial_lbs); // positive compression magnitude
                const util = compForce / (phi * Pcr);
                // Place on opposite perpendicular side relative to tension ratio location to reduce overlap.
                const dx = dxw; const dy = dyw; const Ld = Math.hypot(dx, dy) || 1;
                const nxp = -dy / Ld; const nyp = dx / Ld;
                const offsetScreen = 16; // px
                // Put label on negative perpendicular side
                const rx = mx - nxp * offsetScreen;
                const ry = my - nyp * offsetScreen;
                // Color scale similar thresholds
                const fill = util >= 0.9 ? '#b91c1c' : util >= 0.7 ? '#d97706' : '#065f46';
                bucklingElem = (
                  <text key={f.id + '-buckling'} x={rx} y={ry - 4} fontSize={12} fill={fill}
                        stroke="#fff" strokeWidth={2} paintOrder="stroke" textAnchor="middle" fontFamily="monospace">
                    {util.toFixed(util >= 0.995 ? 2 : 3)}
                  </text>
                );
              }
            }
          }
        }
        return (
          <g key={f.id + '-force'}>
            <text x={mx + 4} y={my - 4} fontSize={11} fill={color} stroke="#fff" strokeWidth={0.8} paintOrder="stroke" style={{ userSelect: 'none' }}>{label}</text>
            {ratioElem}
            {bucklingElem}
          </g>
        );
      })}
      {/* Force vectors at nodes (one per connected beam per node) */}
  {showForces && result && (() => {
        // Build lookup for axial forces by beam id (display sign already inverted downstream)
        const axialMap = new Map<string, number>();
        let maxAbs = 0;
        result.internal_forces.forEach(f => {
          const displayAxial = -f.axial; // invert for UI
          axialMap.set(f.id, displayAxial);
          const a = Math.abs(displayAxial); if (a > maxAbs) maxAbs = a;
        });
        if (maxAbs <= 0) return null;
        const MIN_LEN_PX = 28; const MAX_LEN_PX = 110;
        const groupElems: JSX.Element[] = [];
        nodes.forEach(n => {
          // Collect connected beams & their direction from node
          const connected = beams.filter(b => b.node_start === n.id || b.node_end === n.id);
          if (!connected.length) return;
          type Entry = { beam: BeamInput; dirSign: number; c: number; s: number; axial: number; angle: number };
          const entries: Entry[] = [];
          connected.forEach(b => {
            const axial = axialMap.get(b.id); if (axial == null || Math.abs(axial) < 1e-9) return;
            const otherId = b.node_start === n.id ? b.node_end : b.node_start;
            const other = nodes.find(nn => nn.id === otherId); if (!other) return;
            const dx = other.x - n.x; const dy = other.y - n.y; const L = Math.hypot(dx, dy); if (L < 1e-9) return;
            const c = dx / L; const s = dy / L;
            // Arrow direction for tension: points away from node along member; compression points toward node (reverse)
            const dirSign = axial >= 0 ? 1 : -1;
            const angle = Math.atan2(dirSign * s, dirSign * c); // actual arrow pointing angle
            entries.push({ beam: b, dirSign, c, s, axial, angle });
          });
          if (!entries.length) return;
          // Group near-collinear angles to offset (same 5 deg bin)
            const groups: Record<string, Entry[]> = {};
          entries.forEach(e => {
            const key = (Math.round((e.angle * 180/Math.PI)/5)*5).toString();
            groups[key] = groups[key] || []; groups[key].push(e);
          });
          Object.values(groups).forEach(col => {
            // Sort by magnitude so bigger near center
            col.sort((a,b)=>Math.abs(b.axial)-Math.abs(a.axial));
            const count = col.length;
            const gap = 6; // px offset between stacked arrows
            col.forEach((e, idx) => {
              const axialAbs = Math.abs(e.axial);
              const lenPx = MIN_LEN_PX + (axialAbs / maxAbs) * (MAX_LEN_PX - MIN_LEN_PX);
              // Perpendicular offset for stacking
              let stackOffset = 0;
              if (count > 1) {
                const base = (idx - (count -1)/2) * gap;
                stackOffset = base;
              }
              const perpX = -Math.sin(e.angle); const perpY = Math.cos(e.angle);
              const startX = n.x * SCALE + perpX * stackOffset;
              const startY = n.y * SCALE + perpY * stackOffset;
              // Start a little away from node radius
              const startClear = 8; // px
              const arrowStartX = startX + Math.cos(e.angle) * startClear;
              const arrowStartY = startY + Math.sin(e.angle) * startClear;
              const endX = arrowStartX + Math.cos(e.angle) * lenPx;
              const endY = arrowStartY + Math.sin(e.angle) * lenPx;
              const color = e.axial >= 0 ? '#d62828' : '#1d4ed8';
              // Arrowhead
              const ah = 8; const aw = 5;
              const ax1 = endX - Math.cos(e.angle) * ah + Math.sin(e.angle) * aw;
              const ay1 = endY - Math.sin(e.angle) * ah - Math.cos(e.angle) * aw;
              const ax2 = endX - Math.cos(e.angle) * ah - Math.sin(e.angle) * aw;
              const ay2 = endY - Math.sin(e.angle) * ah + Math.cos(e.angle) * aw;
              const axial_lbs = (e.axial) / UNIT_FACTORS.IPS.force;
              const label = `${Math.abs(axial_lbs).toFixed(1)} ${e.axial >=0 ? 'T' : 'C'}`;
              // Place label near end but slightly offset back along arrow
              const labelX = arrowStartX + Math.cos(e.angle) * (lenPx * 0.6) + perpX * 10;
              const labelY = arrowStartY + Math.sin(e.angle) * (lenPx * 0.6) + perpY * 10;

              // Component arrows (Fx, Fy) for non-axis-aligned resultant
              const compElems: JSX.Element[] = [];
              const isAngled = Math.abs(e.c) > 0.05 && Math.abs(e.s) > 0.05;
              if (isAngled) {
                // Use same length scaling to derive component pixel lengths
                const compScale = lenPx / (Math.abs(e.c) + Math.abs(e.s)); // simple proportional scaling
                const fxLenPx = Math.abs(e.c) * compScale * (Math.abs(e.c)+Math.abs(e.s));
                const fyLenPx = Math.abs(e.s) * compScale * (Math.abs(e.c)+Math.abs(e.s));
                const compColorX = '#2d6a4f';
                const compColorY = '#6d28d9';
                // Horizontal component arrow (sign depends on projection of resultant)
                const signFx = Math.sign(e.c) * (e.axial >=0 ? 1 : -1);
                const fxEndX = arrowStartX + signFx * fxLenPx;
                const fxEndY = arrowStartY;
                const fxAh = 6; const fxAw = 4;
                const fxAng = 0; // horizontal
                const fxAx1 = fxEndX - signFx * fxAh + 0 * fxAw;
                const fxAy1 = fxEndY - fxAw;
                const fxAx2 = fxEndX - signFx * fxAh - 0 * fxAw;
                const fxAy2 = fxEndY + fxAw;
                const fx_lbs = axial_lbs * e.c; // component in lbs
                compElems.push(
                  <g key={`fx-${n.id}-${e.beam.id}`} pointerEvents="none">
                    <line x1={arrowStartX} y1={arrowStartY} x2={fxEndX} y2={fxEndY} stroke={compColorX} strokeWidth={2} />
                    <polygon points={`${fxEndX},${fxEndY} ${fxAx1},${fxAy1} ${fxAx2},${fxAy2}`} fill={compColorX} />
                    <text x={(arrowStartX+fxEndX)/2} y={fxEndY - 6} fontSize={10} fill={compColorX} textAnchor="middle" stroke="#fff" strokeWidth={2} paintOrder="stroke">{Math.abs(fx_lbs).toFixed(1)}x</text>
                  </g>
                );
                // Vertical component
                const signFy = Math.sign(e.s) * (e.axial >=0 ? 1 : -1);
                const fyEndX = arrowStartX;
                const fyEndY = arrowStartY + signFy * fyLenPx;
                const fyAh = 6; const fyAw = 4;
                const fyAx1 = fyEndX - fyAw; const fyAy1 = fyEndY - signFy * fyAh;
                const fyAx2 = fyEndX + fyAw; const fyAy2 = fyEndY - signFy * fyAh;
                const fy_lbs = axial_lbs * e.s;
                compElems.push(
                  <g key={`fy-${n.id}-${e.beam.id}`} pointerEvents="none">
                    <line x1={arrowStartX} y1={arrowStartY} x2={fyEndX} y2={fyEndY} stroke={compColorY} strokeWidth={2} />
                    <polygon points={`${fyEndX},${fyEndY} ${fyAx1},${fyAy1} ${fyAx2},${fyAy2}`} fill={compColorY} />
                    <text x={fyEndX - 6} y={(arrowStartY+fyEndY)/2} fontSize={10} fill={compColorY} textAnchor="end" stroke="#fff" strokeWidth={2} paintOrder="stroke">{Math.abs(fy_lbs).toFixed(1)}y</text>
                  </g>
                );
              }
              groupElems.push(
                <g key={`${n.id}-${e.beam.id}`} pointerEvents="none">
                  {compElems}
                  <line x1={arrowStartX} y1={arrowStartY} x2={endX} y2={endY} stroke={color} strokeWidth={3} />
                  <polygon points={`${endX},${endY} ${ax1},${ay1} ${ax2},${ay2}`} fill={color} />
                  <text x={labelX} y={labelY} fontSize={11} fill={color} textAnchor="middle" stroke="#fff" strokeWidth={2} paintOrder="stroke" fontFamily="monospace">{label}</text>
                </g>
              );
            });
          });
        });
        return groupElems;
      })()}
  {nodes.map(n => {
  const supportType = supports.get(n.id);
  const fixed = !!supportType; // for coloring
        const massValue = masses.get(n.id); // numeric in current unit system
        const selected = pendingBeamStart === n.id && mode === 'beam';
        // Compute physical mass (kg) for size scaling consistency across unit systems
        const massKg = massValue ? (unitSystem === 'IPS' ? massValue * UNIT_FACTORS.IPS.mass : massValue) : 0;
        const radius = 5 + (massKg ? Math.min(10, Math.log10(1 + massKg) * 4) : 0);
        const massLabel = massValue !== undefined ? `${massValue.toFixed(1)} ${unitSystem === 'IPS' ? 'lbm' : 'kg'}` : null;
        return (
          <g key={n.id} onClick={e => { e.stopPropagation(); onNodeClick(n.id); }} cursor="pointer">
            <circle cx={n.x * SCALE} cy={n.y * SCALE} r={radius} fill={selected ? '#ffb703' : fixed ? '#1d3557' : '#457b9d'} stroke={fixed ? '#000' : '#333'} strokeWidth={selected ? 3 : 1} />
            {supportType === 'pin' && (() => {
              // Enhanced rigid (pin) support symbol: larger triangle + ground line with hatched (angled comb) lines.
              const cx = n.x * SCALE;
              const cy = n.y * SCALE;
              const scaleFactor = 1.25; // slightly larger than previous
              const baseWidth = radius * 4 * scaleFactor;
              const halfBase = baseWidth / 2;
              const height = radius * 3 * scaleFactor;
              const baseY = cy + height;
              const groundGap = radius * 0.6 * scaleFactor;
              const groundY = baseY + groundGap;
              const triPoints = [
                `${cx},${cy}`,
                `${cx - halfBase},${baseY}`,
                `${cx + halfBase},${baseY}`
              ].join(' ');
              // Hatch lines: angled at ~45°, confined between ground line and a little below it.
              const hatchSpacing = radius * 0.9 * scaleFactor;
              const hatchLen = radius * 1.4 * scaleFactor;
              const hatchLines: JSX.Element[] = [];
              for (let x = cx - halfBase + hatchSpacing * 0.2; x <= cx + halfBase - hatchSpacing * 0.2; x += hatchSpacing) {
                const x1 = x - hatchLen * 0.4;
                const y1 = groundY;
                const x2 = x + hatchLen * 0.4;
                const y2 = groundY + hatchLen * 0.6; // downward-right
                hatchLines.push(<line key={`h${x}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#222" strokeWidth={1} />);
              }
              return (
                <g>
                  <polygon points={triPoints} fill="#1d3557" stroke="#000" strokeWidth={1.2} />
                  <line x1={cx - halfBase * 0.9} y1={groundY} x2={cx + halfBase * 0.9} y2={groundY} stroke="#000" strokeWidth={2} />
                  {hatchLines}
                </g>
              );
            })()}
            {supportType === 'roller' && (() => {
              const cx = n.x * SCALE;
              const cy = n.y * SCALE;
              const rollerY = cy + radius * 2.2;
              const lineWidth = radius * 4;
              return (
                <g>
                  <line x1={cx - lineWidth/2} y1={rollerY} x2={cx + lineWidth/2} y2={rollerY} stroke="#1d3557" strokeWidth={2} />
                  <circle cx={cx} cy={rollerY + radius * 0.9} r={radius * 0.9} fill="#1d3557" stroke="#000" strokeWidth={1} />
                </g>
              );
            })()}
            {massValue !== undefined && (() => {
              // Hanging trapezoid mass icon below node
              const cx = n.x * SCALE;
              const cy = n.y * SCALE;
              const lineLen = radius * 1.2;
              const topY = cy + radius + lineLen;
              const topWidth = radius * 1.5;
              const bottomWidth = radius * 2.5;
              const height = radius * 1.5;
              const points = [
                `${cx - topWidth / 2},${topY}`,
                `${cx + topWidth / 2},${topY}`,
                `${cx + bottomWidth / 2},${topY + height}`,
                `${cx - bottomWidth / 2},${topY + height}`
              ].join(' ');
              return (
                <g>
                  <line x1={cx} y1={cy + radius} x2={cx} y2={topY} stroke="#222" strokeWidth={1} />
                  <polygon points={points} fill="#595959" stroke="#222" strokeWidth={1} />
                </g>
              );
            })()}
            {massLabel && (
              <text x={n.x * SCALE + 8} y={n.y * SCALE - 8} fontSize={11} fill="#222">{massLabel}</text>
            )}
            <text x={n.x * SCALE + 6} y={n.y * SCALE + 4} fontSize={11} fill="#222">{n.id}</text>
          </g>
        );
      })}
      {/* (Removed separate overlay circles; pill path directly provides rounded ends.) */}
      {hoverPoint && mode === 'node' && (
        <g pointerEvents="none">
          <circle cx={hoverPoint.x * SCALE} cy={hoverPoint.y * SCALE} r={8} fill="rgba(0,123,255,0.25)" stroke="#007bff" strokeDasharray="4 2" />
          <text x={hoverPoint.x * SCALE + 10} y={hoverPoint.y * SCALE - 10} fontSize={11} fill="#225" stroke="#fff" strokeWidth={0.8} paintOrder="stroke">{hoverPoint.x.toFixed(2)}, {hoverPoint.y.toFixed(2)}</text>
        </g>
      )}
      {showGrid && (() => {
        // Improved stable scale bar: sticks to bottom-left, aligns to a major line, minimal jumping via hysteresis.
  const width = 1920; const height = 1000; const desiredLeft = 12; const bottomOffset = 40;
        const major = unitSystem === 'IPS' ? gridSpacing : gridSpacing * 5;
        const majorPx = major * SCALE;
        const worldLeft = panX;
        // Persistent chosen index
        const scaleBarState = (scaleBarStateRef.current ||= { idx: Math.floor(worldLeft / major) });
        // Compute current screen X of stored idx
        let startWorldX = scaleBarState.idx * major;
        let startScreenX = (startWorldX - panX) * SCALE;
        // Hysteresis bounds: keep bar while its left edge within [-0.25*majorPx, desiredLeft + 0.75*majorPx]
        const minX = -0.25 * majorPx;
        const maxX = desiredLeft + 0.75 * majorPx;
        if (startScreenX < minX) {
          // shift right until within
          const deltaIdx = Math.ceil((minX - startScreenX) / majorPx);
          scaleBarState.idx += deltaIdx;
        } else if (startScreenX > maxX) {
          const deltaIdx = Math.ceil((startScreenX - maxX) / majorPx);
            scaleBarState.idx -= deltaIdx;
        }
        // After potential adjustment recompute
        startWorldX = scaleBarState.idx * major;
        startScreenX = (startWorldX - panX) * SCALE;
        // Fine adjustment: if gap from desiredLeft exceeds half spacing and moving one left keeps >= -0.25*majorPx, do it once.
        if (startScreenX - desiredLeft > majorPx * 0.5) {
          const prevScreenX = startScreenX - majorPx;
          if (prevScreenX >= -0.25 * majorPx) {
            scaleBarState.idx -= 1;
            startWorldX = scaleBarState.idx * major;
            startScreenX = (startWorldX - panX) * SCALE;
          }
        }
        const barPx = majorPx;
        // Subdivisions
        let sub: number[] = [];
        if (unitSystem === 'IPS') {
          if (major <= 1) { for (let v=0; v<= major + 1e-9; v += 0.125) sub.push(v); }
          else if (major <= 12) { for (let v=0; v<= major + 1e-9; v += 1) sub.push(v); }
          else if (major <= 36) { for (let v=0; v<= major + 1e-9; v += 6) sub.push(v); }
          else if (major <= 120) { for (let v=0; v<= major + 1e-9; v += 12) sub.push(v); }
          else { for (let v=0; v<= major + 1e-9; v += 60) sub.push(v); }
        } else { for (let i=0;i<=5;i++) sub.push(major * i / 5); }
        const formatIPS = (val: number) => {
          if (val >= 12) { const feet = Math.floor(val / 12); const inches = val - feet * 12; return inches < 1e-6 ? `${feet}\u2032` : `${feet}\u2032 ${inches}\u2033`; }
          if (val >= 1) return `${val}\u2033`;
          const eighths = Math.round(val / 0.125); if (eighths === 0) return '0"'; const whole = Math.floor(eighths / 8); const frac = eighths % 8; const fracStr = frac ? `${frac}/8` : ''; return whole ? `${whole} ${fracStr}\u2033` : `${fracStr}\u2033`;
        };
        const formatKMS = (val: number) => { if (val >= 1) return `${val} m`; if (val >= 0.01) return `${(val*100).toFixed(0)} cm`; return `${(val*1000).toFixed(0)} mm`; };
        const label = unitSystem === 'IPS' ? formatIPS(major) : formatKMS(major);
        const labelWidth = Math.max(34, label.length * 8);
        const labelX = startScreenX + 4;
        return (
          <g pointerEvents="none">
            <line x1={startScreenX} y1={height - bottomOffset} x2={startScreenX + barPx} y2={height - bottomOffset} stroke="#111" strokeWidth={2} />
            {sub.map(v => {
              const x = startScreenX + v * SCALE;
              const majorTick = Math.abs(v) < 1e-6 || Math.abs(v - major) < 1e-6;
              return <line key={v} x1={x} y1={height - bottomOffset - (majorTick ? 12 : 8)} x2={x} y2={height - bottomOffset} stroke="#111" strokeWidth={majorTick ? 2 : 1} />;
            })}
            <rect x={labelX} y={height - bottomOffset + 4} rx={3} ry={3} height={16} width={labelWidth} fill="#111" />
            <text x={labelX + 4} y={height - bottomOffset + 16} fontSize={13} fill="#fff" fontFamily="monospace">{label}</text>
          </g>
        );
      })()}
      </g>
    </svg>
  );
};

// Ref to persist scale bar state between renders
const scaleBarStateRef: { current: { idx: number } | null } = { current: null };
