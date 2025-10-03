import React, { useRef } from 'react';
import { BeamInput, NodeInput, SimulationResult, ToolMode, UnitSystem, SupportType } from '../types';
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
}

const SCALE = 1; // pixels per model unit
const DISP_SCALE = 200; // exaggeration factor for displacement visualization

export const FrameCanvas: React.FC<Props> = ({ nodes, beams, result, mode, pendingBeamStart, supports, masses, unitSystem = 'KMS', onAddNode, onNodeClick, onDeleteBeam }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (mode !== 'node') return; // only add nodes in node mode
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / SCALE;
    const y = (e.clientY - rect.top) / SCALE;
    onAddNode(x, y);
  };

  const displacementMap = new Map<string, { ux: number; uy: number }>();
  if (result) {
    result.displacements.forEach(d => displacementMap.set(d.id, { ux: d.ux, uy: d.uy }));
  }

  return (
    <svg ref={svgRef} width={800} height={500} style={{ border: '1px solid #888', background: '#fff' }} onClick={handleClick}>
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
    </svg>
  );
};
