import React, { useEffect, useMemo, useState } from 'react';
import { useParentSize } from '@visx/responsive';
import { sum } from 'd3-array';
import TrendChart from './TrendChart';
import RangeBrush from './RangeBrush';
import HourBars from './HourBars';
import ProjectLines, { type ProjectLine } from './ProjectLines';
import ProjectPicker from './ProjectPicker';
import WeekScope from './WeekScope';
import SummaryCard from './SummaryCard';
import { buildDigest } from './digest';
import {
  type Callout, type CalloutTone, type Cycle, type DateRange, type Entry, type Granularity, type Measure,
  type Metric, type Project, type SeriesPoint, type Session,
  addDays, addProfiles, buildSeries, cycleProfile, foldToDay, formatDuration, formatHours, hoursByDay, hoursByProject,
  inRange, placeUntimed, rangeDays, reconcileSessions, slotLabel, toKey, weekOf,
} from './analytics';

interface AnalyticsData {
  projects: Project[];
  entries: Entry[];
  sessions: Session[];
}

const today = () => toKey(new Date());
const daysAgo = (n: number) => toKey(addDays(new Date(), -n));
const DEFAULT_RANGE: DateRange = { from: daysAgo(89), to: today() };

const PRESETS: { label: string; range: () => DateRange | null }[] = [
  { label: '7D', range: () => ({ from: daysAgo(6), to: today() }) },
  { label: '30D', range: () => ({ from: daysAgo(29), to: today() }) },
  { label: '90D', range: () => ({ from: daysAgo(89), to: today() }) },
  { label: 'YTD', range: () => ({ from: `${new Date().getFullYear()}-01-01`, to: today() }) },
  { label: 'All', range: () => null }, // resolved against the data extent
];

const GRANULARITIES: Granularity[] = ['day', 'week', 'month'];
const TONES: CalloutTone[] = ['primary', 'accent', 'success'];
const SERIES_SLOTS = 8; // categorical palette size (--series-1…8); never cycled
const seriesColor = (slot: number) => `var(--series-${slot + 1})`;

const Visualise: React.FC = () => {
  // One width for every chart: they all span the content column
  const { parentRef: widthRef, width } = useParentSize({ ignoreDimensions: 'height', debounceTime: 50 });

  const [raw, setRaw] = useState<AnalyticsData | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [callouts, setCallouts] = useState<Callout[]>([]);
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);
  const [brushKey, setBrushKey] = useState(0); // bump to re-seat the brush after an external range change
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [measure, setMeasure] = useState<Measure>('total');
  const [barCycle, setBarCycle] = useState<Cycle>('day');

  // Project comparison: each compared project holds a palette slot until removed, so colours never shift
  const [lineSlots, setLineSlots] = useState<Map<number, number>>(new Map());
  const [lineCycle, setLineCycle] = useState<Cycle>('day');
  const [lineScale, setLineScale] = useState<'hours' | 'share'>('hours');
  const [scopeWeeks, setScopeWeeks] = useState<Set<string>>(new Set()); // empty = follow the page range
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const [granularity, setGranularity] = useState<Granularity>('week');
  const metric: Metric = 'period'; // cumulative is supported by TrendChart but switched off for now
  const [selectedCalloutId, setSelectedCalloutId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/analytics').then(r => r.json()),
      fetch('/api/callouts').then(r => r.json()),
    ]).then(([analytics, savedCallouts]: [AnalyticsData, Callout[]]) => {
      setRaw(analytics);
      setSelected(new Set(analytics.projects.map(p => p.id)));
      setCallouts(savedCallouts);
      // Start the comparison with the four busiest (non-deleted) projects in the default range
      const active = new Set(analytics.projects.filter(p => p.status !== 'deleted').map(p => p.id));
      const hours = hoursByProject(analytics.entries.filter(e => active.has(e.project_id) && inRange(e.date, DEFAULT_RANGE)));
      const top = [...hours].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id);
      setLineSlots(new Map(top.map((id, slot) => [id, slot])));
    });
  }, []);

  const setRangeExternally = (r: DateRange) => {
    setRange(r);
    setBrushKey(k => k + 1);
  };

  const updateCompared = (next: Set<number>) => {
    setLineSlots(prev => {
      const kept = new Map([...prev].filter(([id]) => next.has(id)));
      const used = new Set(kept.values());
      for (const id of next) {
        if (kept.has(id)) continue;
        const free = [...Array(SERIES_SLOTS).keys()].find(s => !used.has(s));
        if (free == null) break;
        kept.set(id, free);
        used.add(free);
      }
      return kept;
    });
  };

  // --- Derived data -----------------------------------------------------------
  // Deleted projects keep their history but stay out of every view unless the switch is on
  const deletedCount = raw?.projects.filter(p => p.status === 'deleted').length ?? 0;
  const data = useMemo<AnalyticsData | null>(() => {
    if (!raw) return null;
    const projects = raw.projects
      .filter(p => showDeleted || p.status !== 'deleted')
      .map(p => (p.status === 'deleted' ? { ...p, name: `${p.name} (deleted)` } : p));
    const visible = new Set(projects.map(p => p.id));
    return {
      projects,
      entries: raw.entries.filter(e => visible.has(e.project_id)),
      sessions: raw.sessions.filter(s => visible.has(s.project_id)),
    };
  }, [raw, showDeleted]);

  const projectNames = useMemo(() => new Map((data?.projects ?? []).map(p => [p.id, p.name])), [data]);

  const extent = useMemo<DateRange>(() => ({ from: data?.entries[0]?.date ?? daysAgo(30), to: today() }), [data]);

  const rangeEntries = useMemo(() => (data?.entries ?? []).filter(e => inRange(e.date, range)), [data, range]);
  const rangeSessions = useMemo(() => (data?.sessions ?? []).filter(s => inRange(s.date, range)), [data, range]);
  const projectHours = useMemo(() => hoursByProject(rangeEntries), [rangeEntries]);

  // Time of day. Reconcile everything once (it's per project-day, so filtering the result equals
  // reconciling a subset), then learn each project's usual hours to place hand-entered time.
  const allReconciled = useMemo(() => reconcileSessions(data?.sessions ?? [], data?.entries ?? []), [data]);
  const habits = useMemo(() => cycleProfile(allReconciled.sessions, 'week'), [allReconciled]);

  const profileFor = (keep: (projectId: number, date: string) => boolean) => ({
    timed: cycleProfile(allReconciled.sessions.filter(s => keep(s.project_id, s.date)), 'week'),
    placed: placeUntimed(allReconciled.untimed.filter(u => keep(u.project_id, u.date)), habits),
  });

  const bars = useMemo(() => profileFor((id, date) => selected.has(id) && inRange(date, range)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allReconciled, habits, selected, range]);
  const footnote = useMemo(() => reconcileSessions(
    rangeSessions.filter(s => selected.has(s.project_id)), rangeEntries.filter(e => selected.has(e.project_id)),
  ), [rangeSessions, rangeEntries, selected]);

  const days = rangeDays(range);
  const avgDivisor = (c: Cycle, scopeDays: number) => (measure === 'total' ? 1 : c === 'day' ? scopeDays : scopeDays / 7);

  // Project lines: their own picker, scoped by the weeks chosen on the dot calendar
  const inScope = (date: string) => (scopeWeeks.size ? scopeWeeks.has(weekOf(date)) : inRange(date, range));
  const scopeDays = scopeWeeks.size ? scopeWeeks.size * 7 : days;
  const lineProfile = useMemo(() => {
    const p = profileFor((id, date) => lineSlots.has(id) && inScope(date));
    const both = addProfiles(p.timed, p.placed);
    return lineCycle === 'day' ? foldToDay(both) : both;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allReconciled, habits, lineSlots, scopeWeeks, range, lineCycle]);
  const lines: ProjectLine[] = [...lineSlots]
    .sort((a, b) => a[1] - b[1])
    .map(([id, slot]) => {
      const raw = lineProfile.byProject.get(id) ?? new Array<number>(lineCycle === 'day' ? 24 : 168).fill(0);
      const projectTotal = sum(raw);
      const values = lineScale === 'share'
        ? raw.map(v => (projectTotal ? v / projectTotal : 0))
        : raw.map(v => v / avgDivisor(lineCycle, scopeDays));
      return { id, name: projectNames.get(id) ?? `#${id}`, color: seriesColor(slot), values };
    });

  const dailyHours = useMemo(() => hoursByDay((data?.entries ?? []).filter(e => selected.has(e.project_id))), [data, selected]);

  // Summary digest covers all data, independent of the slicers
  const digest = useMemo(() => (data
    ? buildDigest(data.projects, data.entries, data.sessions, allReconciled,
      addProfiles(habits, placeUntimed(allReconciled.untimed, habits)))
    : null), [data, allReconciled, habits]);

  // Timeline
  const slicedEntries = useMemo(() => (data?.entries ?? []).filter(e => selected.has(e.project_id)), [data, selected]);
  const visibleEntries = useMemo(() => rangeEntries.filter(e => selected.has(e.project_id)), [rangeEntries, selected]);
  const series = useMemo(() => buildSeries(visibleEntries, range, granularity, metric), [visibleEntries, range, granularity, metric]);
  const seriesAverage = series.length ? sum(series, p => p.hours) / series.length : null;
  const overview = useMemo(() => buildSeries(slicedEntries, extent, 'day', 'period'), [slicedEntries, extent]);

  const allIds = data?.projects.map(p => p.id) ?? [];
  const singleProject = selected.size === 1 ? data?.projects.find(p => selected.has(p.id)) ?? null : null;

  const total = sum(visibleEntries, e => e.duration) / 3600;
  const activeDays = new Set(visibleEntries.map(e => e.date)).size;
  const dayTotals = foldToDay(addProfiles(bars.timed, bars.placed)).total;
  const peakSlot = dayTotals.indexOf(Math.max(...dayTotals));
  const kpis = [
    { label: 'Hours', value: formatHours(total) },
    { label: 'Active days', value: String(activeDays) },
    { label: 'Avg / active day', value: activeDays ? formatDuration(total / activeDays) : '—' },
    { label: 'Busiest hour', value: dayTotals[peakSlot] > 0 ? slotLabel(peakSlot, 'day') : '—' },
  ];

  // --- Callouts ---------------------------------------------------------------
  const saveCallout = (c: Callout) => {
    fetch(`/api/callouts/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
  };

  const patchCallout = (id: number, patch: Partial<Callout>, persist = true) => {
    const current = callouts.find(c => c.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    setCallouts(prev => prev.map(c => (c.id === id ? next : c)));
    if (persist) saveCallout(next);
  };

  const addCallout = async (point: SeriesPoint, dx: number) => {
    const res = await fetch('/api/callouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: point.key, label: 'Note', tone: 'primary', dx, dy: -40 }),
    });
    const created: Callout = await res.json();
    setCallouts(prev => [...prev, created]);
    setSelectedCalloutId(created.id);
  };

  const deleteCallout = (id: number) => {
    fetch(`/api/callouts/${id}`, { method: 'DELETE' });
    setCallouts(prev => prev.filter(c => c.id !== id));
    setSelectedCalloutId(null);
  };

  const activeCallout = callouts.find(c => c.id === selectedCalloutId) ?? null;
  const barNote = measure === 'total'
    ? `Total per hour of the ${barCycle}`
    : barCycle === 'day' ? `Average day across ${days} days` : `Average week across ${+(days / 7).toFixed(1)} weeks`;

  return (
    <div className="visualise">
      <div ref={widthRef} />
      {!data ? (
        <div className="loading-container">
          <div className="loading-spinner" />
          <p>Loading analytics…</p>
        </div>
      ) : (
        <>
          {digest && <SummaryCard digest={digest} />}

          {/* Slicers */}
          <div className="viz-controls">
            <div className="viz-control-group">
              {PRESETS.map(p => (
                <button key={p.label} className="toggle-view-button"
                  onClick={() => setRangeExternally(p.range() ?? extent)}>{p.label}</button>
              ))}
            </div>
            <ProjectPicker label="Projects" projects={data.projects} hours={projectHours}
              selected={selected} onChange={setSelected} />
            <div className="viz-control-group">
              <button className={`tab-button ${measure === 'total' ? 'active' : ''}`} onClick={() => setMeasure('total')}>Total</button>
              <button className={`tab-button ${measure === 'average' ? 'active' : ''}`} onClick={() => setMeasure('average')}>Average</button>
            </div>
          </div>

          <div className="viz-kpis">
            {kpis.map(k => (
              <div key={k.label} className="viz-kpi">
                <div className="viz-kpi-value">{k.value}</div>
                <div className="viz-kpi-label">{k.label}</div>
              </div>
            ))}
          </div>

          {/* Hour of the day / week */}
          <section className="viz-section">
            <div className="viz-section-header">
              <h2 className="calendar-title">Through the {barCycle}</h2>
              <div className="viz-control-group">
                <span className="text-secondary">{barNote}</span>
                <button className={`tab-button ${barCycle === 'day' ? 'active' : ''}`} onClick={() => setBarCycle('day')}>Day</button>
                <button className={`tab-button ${barCycle === 'week' ? 'active' : ''}`} onClick={() => setBarCycle('week')}>Week</button>
              </div>
            </div>
            <HourBars width={width} height={260} cycle={barCycle} timed={bars.timed} placed={bars.placed}
              dayDivisor={avgDivisor('day', days)} weekDivisor={avgDivisor('week', days)} projectNames={projectNames} />
            <div className="viz-legend">
              <span className="legend-item"><i className="legend-swatch timed" />Timed</span>
              <span className="legend-item"><i className="legend-swatch placed" />Entered by hand, spread over that project's usual hours</span>
            </div>
            <p className="viz-footnote">
              Timer sessions are trimmed to your daily totals ({formatDuration(footnote.trimmedHours)} of runaway timers removed).
              {' '}{formatDuration(footnote.untimedHours)} entered by hand has no clock time, so it's placed on its weekday
              in proportion to when you usually work on that project.
            </p>
          </section>

          {/* Projects across the cycle, scoped by week */}
          <section className="viz-section">
            <div className="viz-section-header">
              <h2 className="calendar-title">Projects through the {lineCycle}</h2>
              <div className="viz-control-group">
                <button className={`tab-button ${lineCycle === 'day' ? 'active' : ''}`} onClick={() => setLineCycle('day')}>Day</button>
                <button className={`tab-button ${lineCycle === 'week' ? 'active' : ''}`} onClick={() => setLineCycle('week')}>Week</button>
                <button className={`tab-button ${lineScale === 'hours' ? 'active' : ''}`} onClick={() => setLineScale('hours')}>Hours</button>
                <button className={`tab-button ${lineScale === 'share' ? 'active' : ''}`} onClick={() => setLineScale('share')}>% of project</button>
              </div>
            </div>
            <WeekScope year={new Date().getFullYear()} dailyHours={dailyHours} selectedWeeks={scopeWeeks}
              fallbackRange={range} onChange={setScopeWeeks} />
            <div className="viz-legend">
              <ProjectPicker label="Compare" projects={data.projects} hours={projectHours}
                selected={new Set(lineSlots.keys())} onChange={updateCompared}
                colorFor={id => { const s = lineSlots.get(id); return s == null ? undefined : seriesColor(s); }}
                maxSelected={SERIES_SLOTS} />
              {lines.map(l => (
                <span key={l.id} className="legend-item"
                  onMouseEnter={() => setHighlightId(l.id)} onMouseLeave={() => setHighlightId(null)}>
                  <i className="legend-dot" style={{ background: l.color }} />{l.name}
                </span>
              ))}
            </div>
            <ProjectLines width={width} height={300} cycle={lineCycle} lines={lines} scale={lineScale} highlightId={highlightId} />
          </section>

          {/* Timeline */}
          <section className="viz-section">
            <div className="viz-section-header">
              <h2 className="calendar-title">
                Timeline · {singleProject ? singleProject.name : selected.size === allIds.length ? 'All projects' : `${selected.size} projects`}
              </h2>
              <div className="viz-control-group">
                {GRANULARITIES.map(g => (
                  <button key={g} className={`tab-button ${granularity === g ? 'active' : ''}`}
                    onClick={() => setGranularity(g)}>{g[0].toUpperCase() + g.slice(1)}</button>
                ))}
              </div>
            </div>
            <TrendChart
              width={width} height={340}
              series={series} granularity={granularity} metric={metric}
              callouts={callouts} selectedCalloutId={selectedCalloutId}
              estimate={singleProject?.estimate_hours ?? null}
              average={seriesAverage}
              onAddCallout={addCallout}
              onMoveCallout={(c, dx, dy) => patchCallout(c.id, { dx, dy })}
              onSelectCallout={setSelectedCalloutId}
            />
            <RangeBrush key={brushKey} width={width} height={48} series={overview} range={range} onChange={setRange} />
            <span className="text-secondary">Drag across the strip to set the range · click the line to pin a callout</span>

            {activeCallout && (
              <div className="callout-editor">
                <input className="time-cell-input callout-input" value={activeCallout.label} placeholder="Label"
                  onChange={e => patchCallout(activeCallout.id, { label: e.target.value }, false)}
                  onBlur={() => saveCallout(activeCallout)} />
                <input className="time-cell-input callout-input" value={activeCallout.note ?? ''} placeholder="Note (optional)"
                  onChange={e => patchCallout(activeCallout.id, { note: e.target.value }, false)}
                  onBlur={() => saveCallout(activeCallout)} />
                <div className="viz-control-group">
                  {TONES.map(t => (
                    <button key={t} className={`tone-swatch tone-${t} ${activeCallout.tone === t ? 'active' : ''}`}
                      aria-label={t} onClick={() => patchCallout(activeCallout.id, { tone: t })} />
                  ))}
                </div>
                <button className="toggle-view-button" onClick={() => deleteCallout(activeCallout.id)}>Delete</button>
                <button className="toggle-view-button" onClick={() => setSelectedCalloutId(null)}>Done</button>
              </div>
            )}
          </section>

          <label className="viz-switch">
            <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />
            <span className="viz-switch-track" aria-hidden="true"><span className="viz-switch-thumb" /></span>
            Show deleted projects{deletedCount ? ` (${deletedCount})` : ''}
          </label>
        </>
      )}
    </div>
  );
};

export default Visualise;
