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
}

const DISP_SCALE = 200; // exaggeration factor for displacement visualization

export const FrameCanvas: React.FC<Props> = ({ nodes, beams, result, mode, pendingBeamStart, supports, masses, unitSystem = 'KMS', onAddNode, onNodeClick, onDeleteBeam, showGrid = false, gridSpacing = 50, snapMode = 'free', setStatus }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverPoint, setHoverPoint] = React.useState<{x:number,y:number}|null>(null);

  // Dynamic scale so that one major grid spacing maps to a target pixel length.
  const TARGET_MAJOR_PX = 250; // desired pixel width of one major spacing
  const majorSpacingUnits = unitSystem === 'IPS' ? gridSpacing : gridSpacing * 5;
  const SCALE = majorSpacingUnits > 0 ? TARGET_MAJOR_PX / majorSpacingUnits : 1;

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
  let x = (clientX - rect.left) / SCALE;
  let y = (clientY - rect.top) / SCALE;
    const step = altKey ? 0 : getSnapStep();
    if (step > 0) {
      x = Math.round(x / step) * step;
      y = Math.round(y / step) * step;
    }
    return {x,y, step};
  };

  const handleClick = (e: React.MouseEvent) => {
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
      style={{ border: '1px solid #888', background: '#fff', maxWidth: '100%', height: 'auto' }}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {showGrid && gridSpacing > 0 && (
        <g pointerEvents="none">
          {(() => {
            const lines: JSX.Element[] = [];
            const width = 1600; // pixel canvas width
            const height = 1000; // pixel canvas height
            const eps = 1e-6;
            let minor: number;
            let major: number;
            if (unitSystem === 'IPS') {
              // Selected gridSpacing is the major spacing in inches; derive minor per spec
              major = gridSpacing;
              if (Math.abs(gridSpacing - 1) < eps) minor = 0.125;           // 1/8" subdivisions
              else if (Math.abs(gridSpacing - 12) < eps) minor = 1;         // 1" subdivisions
              else if (Math.abs(gridSpacing - 36) < eps) minor = 6;         // 6" subdivisions
              else if (Math.abs(gridSpacing - 120) < eps) minor = 12;       // 1' (12")
              else if (Math.abs(gridSpacing - 600) < eps) minor = 60;       // 5'
              else { minor = gridSpacing / 5; }
            } else {
              // KMS: keep previous behavior (minor=spacing, major=5x)
              minor = gridSpacing;
              major = gridSpacing * 5;
            }
            const modelWidth = width / SCALE;
            const modelHeight = height / SCALE;
            // Performance safeguard: if extremely fine (e.g. 1/8"), cap lines drawn
            const estLines = (modelWidth / minor) + (modelHeight / minor);
            const MAX_LINES = 20000; // soft cap
            let stride = 1;
            if (estLines > MAX_LINES) {
              stride = Math.ceil(estLines / MAX_LINES);
            }
            for (let xModel = 0, idx = 0; xModel <= modelWidth + eps; xModel += minor, idx++) {
              if (idx % stride !== 0) continue;
              const isMajor = Math.abs(xModel % major) < eps;
              const xp = xModel * SCALE;
              lines.push(<line key={'gx'+xModel} x1={xp} y1={0} x2={xp} y2={height} stroke={isMajor ? '#cfcfcf' : '#f3f3f3'} strokeWidth={isMajor ? 1 : 0.4} />);
            }
            for (let yModel = 0, idx = 0; yModel <= modelHeight + eps; yModel += minor, idx++) {
              if (idx % stride !== 0) continue;
              const isMajor = Math.abs(yModel % major) < eps;
              const yp = yModel * SCALE;
              lines.push(<line key={'gy'+yModel} x1={0} y1={yp} x2={width} y2={yp} stroke={isMajor ? '#cfcfcf' : '#f3f3f3'} strokeWidth={isMajor ? 1 : 0.4} />);
            }
            return lines;
          })()}
        </g>
      )}
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
        const axial_lbs = f.axial / UNIT_FACTORS.IPS.force; // convert N -> lbf
        const isTension = f.axial > 0;
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
      {/* Scale Indicator */}
      {showGrid && (
        <g transform={`translate(${(unitSystem === 'IPS' ? gridSpacing : gridSpacing * 5) * SCALE},${1000 - 40})`}>
          {(() => {
            // Force display length to exactly one major grid spacing so ends align with major vertical lines.
            // IPS: major = selected gridSpacing; KMS: major = 5 * gridSpacing (our major definition in grid renderer)
            const major = unitSystem === 'IPS' ? gridSpacing : gridSpacing * 5;
            const display = major;
            const barPx = display * SCALE; // SCALE currently 1
            // Build subdivisions
            let sub: number[] = [];
            if (unitSystem === 'IPS') {
              // Choose subdivision based on canonical fractions
              if (display <= 1) {
                const step = 0.125; // eighth inch
                for (let v = 0; v <= display + 1e-9; v += step) sub.push(v);
              } else if (display <= 12) {
                const step = 1; // 1"
                for (let v = 0; v <= display + 1e-9; v += step) sub.push(v);
              } else if (display <= 36) {
                const step = 6; // 6"
                for (let v = 0; v <= display + 1e-9; v += step) sub.push(v);
              } else if (display <= 120) {
                const step = 12; // 1'
                for (let v = 0; v <= display + 1e-9; v += step) sub.push(v);
              } else {
                const step = 60; // 5'
                for (let v = 0; v <= display + 1e-9; v += step) sub.push(v);
              }
            } else {
              // KMS: subdivide into 5 parts
              const parts = 5;
              for (let i = 0; i <= parts; i++) sub.push(display * i / parts);
            }
            const formatIPS = (val: number) => {
              if (val >= 12) {
                const feet = Math.floor(val / 12);
                const inches = val - feet * 12;
                if (inches < 1e-6) return `${feet}\u2032`; // feet only
                return `${feet}\u2032 ${inches}\u2033`;
              }
              if (val >= 1) return `${val}\u2033`;
              // fractional inches to nearest 1/8
              const eighths = Math.round(val / 0.125);
              if (eighths === 0) return '0"';
              const whole = Math.floor(eighths / 8);
              const frac = eighths % 8;
              const fracStr = frac ? `${frac}/8` : '';
              return whole ? `${whole} ${fracStr}\u2033` : `${fracStr}\u2033`;
            };
            const formatKMS = (val: number) => {
              if (val >= 1) return `${val} m`;
              if (val >= 0.01) return `${(val*100).toFixed(0)} cm`;
              return `${(val*1000).toFixed(0)} mm`;
            };
            const label = unitSystem === 'IPS' ? formatIPS(display) : formatKMS(display);
            // Shift label if it would overflow right edge (keep simple; canvas width fixed)
            const labelWidth = Math.max(34, label.length * 8);
            const labelX = 4;
            return (
              <g>
                {/* Bar baseline */}
                <line x1={0} y1={20} x2={barPx} y2={20} stroke="#111" strokeWidth={2} />
                {/* Subdivision ticks */}
                {sub.map(v => {
                  const x = v * SCALE;
                  const majorTick = Math.abs(v) < 1e-6 || Math.abs(v - display) < 1e-6;
                  return <line key={v} x1={x} y1={majorTick ? 8 : 12} x2={x} y2={20} stroke="#111" strokeWidth={majorTick ? 2 : 1} />;
                })}
                {/* Label background */}
                <rect x={labelX} y={0} rx={3} ry={3} height={16} width={labelWidth} fill="#111" />
                <text x={labelX + 4} y={12} fontSize={12} fill="#fff" fontFamily="monospace">{label}</text>
              </g>
            );
          })()}
        </g>
      )}
    </svg>
  );
};
