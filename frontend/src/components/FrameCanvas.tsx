import React, { useRef } from 'react';
import { BeamInput, NodeInput, SimulationResult, ToolMode, UnitSystem, SupportType, SnapMode } from '../types';
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
}

const DISP_SCALE = 200; // exaggeration factor for displacement visualization

export const FrameCanvas: React.FC<Props> = ({ nodes, beams, result, mode, pendingBeamStart, supports, masses, unitSystem = 'KMS', onAddNode, onNodeClick, onDeleteBeam, showGrid = false, gridSpacing = 50, snapMode = 'free', setStatus, zoomScale = 1, panX = 0, panY = 0, onPanChange, onZoomAtCursor }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverPoint, setHoverPoint] = React.useState<{x:number,y:number}|null>(null);
  const [panning, setPanning] = React.useState(false);
  const panStartRef = React.useRef<{clientX:number; clientY:number; panX:number; panY:number} | null>(null);
  const spaceDownRef = React.useRef(false);

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

  return (
    <svg
      ref={svgRef}
  width={1600}
  height={1000}
      style={{ border: '1px solid #888', background: '#fff', maxWidth: '100%', height: 'auto', cursor: panning ? 'grabbing' : (spaceDownRef.current ? 'grab' : 'default') }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={(e) => { handleMouseMove(e); handleMouseMovePan(e); }}
      onMouseUp={endPan}
      onMouseLeave={() => { handleMouseLeave(); endPan(); }}
      onWheel={(e) => {
        if (!svgRef.current || !onZoomAtCursor) return;
        // Prevent page scroll when zooming canvas
        e.preventDefault();
        const rect = svgRef.current.getBoundingClientRect();
        const factor = e.deltaY < 0 ? 1.15 : 1/1.15;
        onZoomAtCursor(factor, e.clientX - rect.left, e.clientY - rect.top, rect, e.deltaY);
      }}
    >
      {showGrid && gridSpacing > 0 && (
        <g pointerEvents="none">
          {(() => {
            const lines: JSX.Element[] = [];
            const width = 1600; // viewport px width
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
      {/* Undeformed beams */}
  {beams.map(b => {
        const n1 = nodes.find(n => n.id === b.node_start);
        const n2 = nodes.find(n => n.id === b.node_end);
        if (!n1 || !n2) return null;
        const deletable = mode === 'delete';
  return <line key={b.id} x1={n1.x * SCALE} y1={n1.y * SCALE} x2={n2.x * SCALE} y2={n2.y * SCALE} stroke={deletable ? '#aa0000' : '#444'} strokeWidth={2} style={deletable ? { cursor: 'pointer' } : undefined} onClick={e => { if (deletable && onDeleteBeam) { e.stopPropagation(); onDeleteBeam(b.id); } }} />;
      })}
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
        return (
          <g key={f.id + '-force'}>
            <text x={mx + 4} y={my - 4} fontSize={10} fill={color} stroke="#fff" strokeWidth={0.8} paintOrder="stroke" style={{ userSelect: 'none' }}>{label}</text>
          </g>
        );
      })}
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
              const cx = n.x * SCALE;
              const cy = n.y * SCALE;
              const baseWidth = radius * 4;
              const halfBase = baseWidth / 2;
              const height = radius * 3;
              const baseY = cy + height;
              const points = [
                `${cx},${cy}`,
                `${cx - halfBase},${baseY}`,
                `${cx + halfBase},${baseY}`
              ].join(' ');
              return <polygon points={points} fill="#1d3557" stroke="#000" strokeWidth={1} />;
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
              <text x={n.x * SCALE + 8} y={n.y * SCALE - 8} fontSize={10} fill="#222">{massLabel}</text>
            )}
            <text x={n.x * SCALE + 6} y={n.y * SCALE + 4} fontSize={10} fill="#222">{n.id}</text>
          </g>
        );
      })}
      {hoverPoint && mode === 'node' && (
        <g pointerEvents="none">
          <circle cx={hoverPoint.x * SCALE} cy={hoverPoint.y * SCALE} r={8} fill="rgba(0,123,255,0.25)" stroke="#007bff" strokeDasharray="4 2" />
          <text x={hoverPoint.x * SCALE + 10} y={hoverPoint.y * SCALE - 10} fontSize={10} fill="#225" stroke="#fff" strokeWidth={0.8} paintOrder="stroke">{hoverPoint.x.toFixed(2)}, {hoverPoint.y.toFixed(2)}</text>
        </g>
      )}
      {showGrid && (() => {
        // Improved stable scale bar: sticks to bottom-left, aligns to a major line, minimal jumping via hysteresis.
        const width = 1600; const height = 1000; const desiredLeft = 12; const bottomOffset = 40;
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
            <text x={labelX + 4} y={height - bottomOffset + 16} fontSize={12} fill="#fff" fontFamily="monospace">{label}</text>
          </g>
        );
      })()}
      </g>
    </svg>
  );
};

// Ref to persist scale bar state between renders
const scaleBarStateRef: { current: { idx: number } | null } = { current: null };
