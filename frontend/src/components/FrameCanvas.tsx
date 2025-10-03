import React, { useRef } from 'react';
import { BeamInput, NodeInput, SimulationResult, ToolMode, UnitSystem } from '../types';
import { UNIT_FACTORS } from '../units';

interface Props {
  nodes: NodeInput[];
  beams: BeamInput[];
  result?: SimulationResult | null;
  mode: ToolMode;
  pendingBeamStart: string | null;
  fixtures: Set<string>; // node ids with full fix
  masses: Map<string, number>; // node_id -> total mass
  unitSystem?: UnitSystem;
  onAddNode: (x: number, y: number) => void;
  onNodeClick: (id: string) => void; // context dependent on mode
}

const SCALE = 1; // pixels per model unit
const DISP_SCALE = 200; // exaggeration factor for displacement visualization

export const FrameCanvas: React.FC<Props> = ({ nodes, beams, result, mode, pendingBeamStart, fixtures, masses, unitSystem = 'KMS', onAddNode, onNodeClick }) => {
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
        return <line key={b.id} x1={n1.x * SCALE} y1={n1.y * SCALE} x2={n2.x * SCALE} y2={n2.y * SCALE} stroke="#444" strokeWidth={2} />;
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
      {nodes.map(n => {
        const fixed = fixtures.has(n.id);
        const massValue = masses.get(n.id); // numeric in current unit system
        const selected = pendingBeamStart === n.id && mode === 'beam';
        // Compute physical mass (kg) for size scaling consistency across unit systems
        const massKg = massValue ? (unitSystem === 'IPS' ? massValue * UNIT_FACTORS.IPS.mass : massValue) : 0;
        const radius = 5 + (massKg ? Math.min(10, Math.log10(1 + massKg) * 4) : 0);
        const massLabel = massValue !== undefined ? `${massValue.toFixed(1)} ${unitSystem === 'IPS' ? 'lbm' : 'kg'}` : null;
        return (
          <g key={n.id} onClick={e => { e.stopPropagation(); onNodeClick(n.id); }} cursor="pointer">
            <circle cx={n.x * SCALE} cy={n.y * SCALE} r={radius} fill={selected ? '#ffb703' : fixed ? '#1d3557' : '#457b9d'} stroke={fixed ? '#000' : '#333'} strokeWidth={selected ? 3 : 1} />
            {fixed && (() => {
              // Draw a support triangle: apex at node center, base below.
              const cx = n.x * SCALE;
              const cy = n.y * SCALE;
              const baseWidth = radius * 4; // ~4x node radius per request
              const halfBase = baseWidth / 2;
              const height = radius * 3; // visually balanced; adjust if desired
              const baseY = cy + height;
              const points = [
                `${cx},${cy}`, // apex touching node
                `${cx - halfBase},${baseY}`,
                `${cx + halfBase},${baseY}`
              ].join(' ');
              return <polygon points={points} fill="#1d3557" stroke="#000" strokeWidth={1} />;
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
