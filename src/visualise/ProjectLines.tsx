import React, { useMemo, useState } from 'react';
import { Group } from '@visx/group';
import { scaleLinear } from '@visx/scale';
import { LinePath, Line } from '@visx/shape';
import { AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { curveMonotoneX } from '@visx/curve';
import { localPoint } from '@visx/event';
import { TooltipWithBounds } from '@visx/tooltip';
import { max } from 'd3-array';
import { type Cycle, WEEKDAYS, cycleLength, durationTick, formatDuration, slotLabel } from './analytics';

export interface ProjectLine {
  id: number;
  name: string;
  color: string;
  values: number[]; // hours, or share (0–1) of the project's time
}

interface ProjectLinesProps {
  width: number;
  height: number;
  cycle: Cycle;
  lines: ProjectLine[];
  scale: 'hours' | 'share';
  highlightId: number | null;
}

const margin = { top: 16, right: 16, bottom: 28, left: 44 };

/** One line per project across the slots of a day or week. */
const ProjectLines: React.FC<ProjectLinesProps> = ({ width, height, cycle, lines, scale, highlightId }) => {
  const [hover, setHover] = useState<number | null>(null);
  const n = cycleLength(cycle);
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = height - margin.top - margin.bottom;

  // Points sit at slot centres so they line up with the bars above
  const x = useMemo(() => scaleLinear({ domain: [0, n], range: [0, innerWidth] }), [n, innerWidth]);
  const yMax = max(lines.flatMap(l => l.values)) || (scale === 'share' ? 0.1 : 1);
  const y = useMemo(() => scaleLinear({ domain: [0, yMax], range: [innerHeight, 0], nice: true }), [yMax, innerHeight]);

  const format = (v: number) => (scale === 'share' ? `${Math.round(v * 100)}%` : formatDuration(v));

  if (width < 10) return null;

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    const p = localPoint(event);
    if (!p) return;
    setHover(Math.max(0, Math.min(n - 1, Math.floor(x.invert(p.x - margin.left)))));
  };

  const rows = hover == null ? [] : [...lines].sort((a, b) => b.values[hover] - a.values[hover]);
  const cx = (i: number) => x(i + 0.5);

  return (
    <div className="trend-chart">
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          <GridRows scale={y} width={innerWidth} numTicks={4} stroke="#D0D0D0" strokeWidth={0.7} />
          {cycle === 'week'
            ? WEEKDAYS.map((d, i) => (
              <g key={d}>
                {i > 0 && <line x1={x(i * 24)} x2={x(i * 24)} y1={0} y2={innerHeight} stroke="var(--color-text-secondary)" strokeWidth={0.5} />}
                <text x={x(i * 24 + 12)} y={innerHeight + 18} textAnchor="middle" className="axis-label">{d}</text>
              </g>
            ))
            : [0, 3, 6, 9, 12, 15, 18, 21].map(h => (
              <text key={h} x={cx(h)} y={innerHeight + 18} textAnchor="middle" className="axis-label">
                {String(h).padStart(2, '0')}:00
              </text>
            ))}
          <line x1={0} x2={innerWidth} y1={innerHeight} y2={innerHeight} stroke="var(--color-text-primary)" strokeWidth={1} />

          {lines.map(l => (
            <LinePath key={l.id} data={l.values} x={(_, i) => cx(i)} y={v => y(v)}
              curve={curveMonotoneX} stroke={l.color} strokeWidth={2}
              strokeOpacity={highlightId == null || highlightId === l.id ? 1 : 0.15} />
          ))}

          <AxisLeft scale={y} numTicks={4} hideAxisLine hideTicks
            tickFormat={v => (scale === 'share' ? `${Math.round(Number(v) * 100)}%` : durationTick(Number(v)))}
            tickLabelProps={{ fill: 'var(--color-text-secondary)', fontSize: 13, fontFamily: 'var(--font-secondary)', fontWeight: 300 }} />

          {hover != null && (
            <g pointerEvents="none">
              <Line from={{ x: cx(hover), y: 0 }} to={{ x: cx(hover), y: innerHeight }} stroke="var(--color-text-secondary)" strokeWidth={0.7} />
              {lines.map(l => (
                <circle key={l.id} cx={cx(hover)} cy={y(l.values[hover])} r={4} fill={l.color}
                  stroke="var(--color-background)" strokeWidth={2} />
              ))}
            </g>
          )}

          <rect x={0} y={0} width={innerWidth} height={innerHeight} fill="transparent"
            onMouseMove={handleMove} onMouseLeave={() => setHover(null)} />
        </Group>
      </svg>

      {hover != null && lines.length > 0 && (
        <TooltipWithBounds top={margin.top + 8} left={cx(hover) + margin.left} unstyled applyPositionStyle className="chart-tooltip">
          <div className="chart-tooltip-label">{slotLabel(hover, cycle)}–{String((hover + 1) % 24).padStart(2, '0')}:00</div>
          {rows.map(l => (
            <div key={l.id} className="chart-tooltip-row">
              <span><i className="legend-dot" style={{ background: l.color }} />{l.name}</span>
              <span>{format(l.values[hover])}</span>
            </div>
          ))}
        </TooltipWithBounds>
      )}
    </div>
  );
};

export default ProjectLines;
