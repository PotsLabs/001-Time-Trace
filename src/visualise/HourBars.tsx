import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear } from '@visx/scale';
import { AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { TooltipWithBounds } from '@visx/tooltip';
import { max } from 'd3-array';
import { type Cycle, type Profile, WEEKDAYS, durationTick, formatDuration, slotLabel } from './analytics';

interface HourBarsProps {
  width: number;
  height: number;
  cycle: Cycle;
  timed: Profile; // 168 week slots, raw hours
  placed: Profile; // hand-entered time placed into week slots, raw hours
  dayDivisor: number; // 1 for totals, days in scope for an average day
  weekDivisor: number; // 1 for totals, weeks in scope for an average week
  projectNames: Map<number, string>;
}

const margin = { top: 28, right: 8, bottom: 28, left: 44 };
const DURATION = 1100;
const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21];

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpBox = (a: number[], b: number[], t: number) => a.map((v, i) => lerp(v, b[i], t));
// 0 → 1 across [from, to] of the timeline, eased
const phase = (t: number, from: number, to: number) => easeInOut(Math.min(1, Math.max(0, (t - from) / (to - from))));
const tickProps = { fill: 'var(--color-text-secondary)', fontSize: 13, fontFamily: 'var(--font-secondary)', fontWeight: 300 };

/**
 * Hours worked per hour of the day or of the week, in one chart. Every bar is a week slot;
 * in the day view each hour's seven weekday slots stack into one bar. Switching cycles fans each
 * stack out into seven thin weekday bars, then slides those out to their days (and back).
 */
const HourBars: React.FC<HourBarsProps> = ({ width, height, cycle, timed, placed, dayDivisor, weekDivisor, projectNames }) => {
  const [hover, setHover] = useState<number | null>(null);
  const [t, setT] = useState(cycle === 'week' ? 1 : 0); // 0 = day layout, 1 = week layout
  const tRef = useRef(t);

  useEffect(() => {
    const from = tRef.current;
    const to = cycle === 'week' ? 1 : 0;
    if (from === to) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / (DURATION * Math.abs(to - from)));
      tRef.current = lerp(from, to, p);
      setT(tRef.current);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cycle]);

  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = height - margin.top - margin.bottom;

  const xDay = useMemo(() => scaleBand({ domain: [...Array(24).keys()], range: [0, innerWidth], paddingInner: 0.2 }), [innerWidth]);
  const xWeek = useMemo(() => scaleBand({ domain: [...Array(168).keys()], range: [0, innerWidth], paddingInner: 0.25 }), [innerWidth]);

  const dayTotals = useMemo(() => Array.from({ length: 24 }, (_, h) =>
    WEEKDAYS.reduce((acc, _d, d) => acc + timed.total[d * 24 + h] + placed.total[d * 24 + h], 0) / dayDivisor),
  [timed, placed, dayDivisor]);
  const weekTotals = useMemo(() => timed.total.map((v, s) => (v + placed.total[s]) / weekDivisor), [timed, placed, weekDivisor]);

  const yDay = useMemo(() => scaleLinear({ domain: [0, max(dayTotals) || 1], range: [innerHeight, 0], nice: true }), [dayTotals, innerHeight]);
  const yWeek = useMemo(() => scaleLinear({ domain: [0, max(weekTotals) || 1], range: [innerHeight, 0], nice: true }), [weekTotals, innerHeight]);

  // Geometry of every segment in both layouts. Day stacks: all timed weekday parts, then all placed parts on top.
  const segments = useMemo(() => {
    const out: { key: string; slot: number; placed: boolean; day: number[]; fan: number[]; week: number[] }[] = [];
    const dayCursor = new Array<number>(24).fill(0);
    const fanWidth = xDay.bandwidth() / 7;
    for (const isPlaced of [false, true]) {
      const source = isPlaced ? placed.total : timed.total;
      for (let s = 0; s < 168; s++) {
        const h = s % 24;
        const v = source[s];
        const base = dayCursor[h];
        dayCursor[h] += v / dayDivisor;
        const weekBase = isPlaced ? timed.total[s] / weekDivisor : 0;
        const fanBase = isPlaced ? timed.total[s] / dayDivisor : 0;
        out.push({
          key: `${isPlaced ? 'p' : 't'}${s}`,
          slot: s,
          placed: isPlaced,
          // [x, width, top, bottom] in pixels
          day: [xDay(h) ?? 0, xDay.bandwidth(), yDay(base + v / dayDivisor), yDay(base)],
          // Midpoint: the hour's column split into seven weekday bars, still on the day scale
          fan: [(xDay(h) ?? 0) + Math.floor(s / 24) * fanWidth, fanWidth * 0.8, yDay(fanBase + v / dayDivisor), yDay(fanBase)],
          week: [xWeek(s) ?? 0, xWeek.bandwidth(), yWeek(weekBase + v / weekDivisor), yWeek(weekBase)],
        });
      }
    }
    return out;
  }, [timed, placed, dayDivisor, weekDivisor, xDay, xWeek, yDay, yWeek]);

  const settledCycle: Cycle = t < 0.5 ? 'day' : 'week';
  const hoverSlots = (s: number) => (cycle === 'day' ? s % 24 === hover : s === hover);

  const breakdown = useMemo(() => {
    if (hover == null) return null;
    const slots = cycle === 'day' ? WEEKDAYS.map((_d, d) => d * 24 + hover) : [hover];
    const div = cycle === 'day' ? dayDivisor : weekDivisor;
    const timedHours = slots.reduce((a, s) => a + timed.total[s], 0) / div;
    const placedHours = slots.reduce((a, s) => a + placed.total[s], 0) / div;
    const ids = new Set([...timed.byProject.keys(), ...placed.byProject.keys()]);
    const projects = [...ids]
      .map(id => ({
        name: projectNames.get(id) ?? `#${id}`,
        hours: slots.reduce((a, s) => a + (timed.byProject.get(id)?.[s] ?? 0) + (placed.byProject.get(id)?.[s] ?? 0), 0) / div,
      }))
      .filter(p => p.hours > 0.005)
      .sort((a, b) => b.hours - a.hours);
    return { timedHours, placedHours, projects };
  }, [hover, cycle, timed, placed, dayDivisor, weekDivisor, projectNames]);

  if (width < 10) return null;

  const totals = cycle === 'day' ? dayTotals : weekTotals;
  const peak = totals.indexOf(max(totals) ?? 0);
  const xTarget = cycle === 'day' ? xDay : xWeek;
  const yTarget = cycle === 'day' ? yDay : yWeek;
  const weekStep = xWeek.step();

  return (
    <div className="trend-chart">
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          {/* Each layout's grid, axis and labels fade in turn, never overlapping */}
          <g opacity={1 - phase(t, 0.3, 0.5)}>
            <GridRows scale={yDay} width={innerWidth} numTicks={4} stroke="#D0D0D0" strokeWidth={0.7} />
            <AxisLeft scale={yDay} numTicks={4} hideAxisLine hideTicks tickFormat={v => durationTick(Number(v))} tickLabelProps={tickProps} />
            {HOUR_TICKS.map(h => (
              <text key={h} x={(xDay(h) ?? 0) + xDay.bandwidth() / 2} y={innerHeight + 18} textAnchor="middle" className="axis-label">
                {String(h).padStart(2, '0')}:00
              </text>
            ))}
          </g>
          <g opacity={phase(t, 0.5, 0.7)}>
            <GridRows scale={yWeek} width={innerWidth} numTicks={4} stroke="#D0D0D0" strokeWidth={0.7} />
            <AxisLeft scale={yWeek} numTicks={4} hideAxisLine hideTicks tickFormat={v => durationTick(Number(v))} tickLabelProps={tickProps} />
            {WEEKDAYS.map((d, i) => (
              <g key={d}>
                {i > 0 && <line x1={i * 24 * weekStep - weekStep * 0.125} x2={i * 24 * weekStep - weekStep * 0.125} y1={0} y2={innerHeight}
                  stroke="var(--color-text-secondary)" strokeWidth={0.5} />}
                <text x={(i * 24 + 12) * weekStep} y={innerHeight + 18} textAnchor="middle" className="axis-label">{d}</text>
              </g>
            ))}
          </g>

          {segments.map(seg => {
            // First half: stack → fan; second half: fan → week
            const [x, w, top, bottom] = t <= 0.5
              ? lerpBox(seg.day, seg.fan, phase(t, 0, 0.5))
              : lerpBox(seg.fan, seg.week, phase(t, 0.5, 1));
            if (bottom - top < 0.01) return null;
            const active = hover != null && hoverSlots(seg.slot);
            return (
              <rect key={seg.key} x={x} y={top} width={w}
                // Overlap stacked day segments by half a pixel so no seams show
                height={bottom - top + 0.5 * (1 - phase(t, 0, 0.5))}
                fill={seg.placed
                  ? (active ? 'var(--color-accent-soft)' : 'var(--color-placed)')
                  : (active ? 'var(--color-accent)' : 'var(--color-text-primary)')} />
            );
          })}
          <line x1={0} x2={innerWidth} y1={innerHeight} y2={innerHeight} stroke="var(--color-text-primary)" strokeWidth={1} />

          {/* Direct label on the busiest slot, once the layout has settled */}
          {hover == null && (t === 0 || t === 1) && totals[peak] > 0 && (
            <text x={(xTarget(peak) ?? 0) + xTarget.bandwidth() / 2} y={yTarget(totals[peak]) - 8}
              textAnchor={peak < totals.length * 0.1 ? 'start' : peak > totals.length * 0.9 ? 'end' : 'middle'} className="peak-label">
              {slotLabel(peak, settledCycle)} · {formatDuration(totals[peak])}
            </text>
          )}

          {/* Hit targets for the current cycle, wider than the bars */}
          {totals.map((_, i) => (
            <rect key={`${cycle}${i}`} x={(xTarget(i) ?? 0) - (xTarget.step() - xTarget.bandwidth()) / 2} y={0}
              width={xTarget.step()} height={innerHeight} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          ))}
        </Group>
      </svg>

      {hover != null && breakdown && (
        <TooltipWithBounds top={yTarget(totals[hover]) + margin.top} left={(xTarget(hover) ?? 0) + margin.left + xTarget.bandwidth()}
          unstyled applyPositionStyle className="chart-tooltip">
          <div className="chart-tooltip-value">{formatDuration(totals[hover])}</div>
          <div className="chart-tooltip-label">{slotLabel(hover, cycle)}–{String((hover + 1) % 24).padStart(2, '0')}:00</div>
          <div className="chart-tooltip-hint">
            {formatDuration(breakdown.timedHours)} timed · {formatDuration(breakdown.placedHours)} hand-entered
          </div>
          {breakdown.projects.slice(0, 5).map(p => (
            <div key={p.name} className="chart-tooltip-row">
              <span>{p.name}</span><span>{formatDuration(p.hours)}</span>
            </div>
          ))}
          {breakdown.projects.length > 5 && <div className="chart-tooltip-hint">+{breakdown.projects.length - 5} more</div>}
        </TooltipWithBounds>
      )}
    </div>
  );
};

export default HourBars;
