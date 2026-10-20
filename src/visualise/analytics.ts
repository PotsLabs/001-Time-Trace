import { group, rollup, sum } from 'd3-array';

export interface Project {
  id: number;
  name: string;
  estimate_hours: number;
  status: string;
}

export interface Entry {
  project_id: number;
  date: string; // YYYY-MM-DD
  duration: number; // seconds
}

export interface Session {
  project_id: number;
  date: string;
  start_time: string; // ISO, UTC
  duration: number; // seconds
}

export interface Callout {
  id: number;
  date: string;
  label: string;
  note: string | null;
  tone: CalloutTone;
  dx: number;
  dy: number;
}

export type CalloutTone = 'primary' | 'accent' | 'success';
export type Granularity = 'day' | 'week' | 'month';
export type Metric = 'period' | 'cumulative';
export type Cycle = 'day' | 'week';
export type Measure = 'total' | 'average';

export interface DateRange {
  from: string;
  to: string;
}

export interface SeriesPoint {
  key: string; // period start, YYYY-MM-DD
  date: Date;
  hours: number;
}

export interface SeriesStyle {
  color: string;
  dashed: boolean;
}

// Project lines: black, blue and two greys, then the same four dotted. Fixed order, never cycled.
const SERIES_INKS = ['var(--series-ink)', 'var(--series-blue)', 'var(--series-grey-dark)', 'var(--series-grey-light)'];
export const SERIES_STYLES: SeriesStyle[] = [false, true].flatMap(dashed => SERIES_INKS.map(color => ({ color, dashed })));

export const toneColor: Record<CalloutTone, string> = {
  primary: 'var(--color-text-primary)',
  accent: 'var(--color-accent)',
  success: 'var(--color-success)',
};

// --- Dates (all local, day precision) ---------------------------------------

export const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const startOfPeriod = (d: Date, g: Granularity) => {
  if (g === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  if (g === 'week') return addDays(d, -((d.getDay() + 6) % 7)); // Monday
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const nextPeriod = (d: Date, g: Granularity) =>
  g === 'month' ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : addDays(d, g === 'week' ? 7 : 1);

export const formatDay = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatPeriod = (d: Date, g: Granularity) => {
  if (g === 'month') return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  if (g === 'week') return `Week of ${formatDay(d)}`;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

export const formatHours = (h: number) => (h >= 100 ? h.toFixed(0) : h.toFixed(1));

// --- Aggregation --------------------------------------------------------------

export const inRange = (date: string, r: DateRange) => date >= r.from && date <= r.to;

/** Bucket entries into periods across the whole range, filling empty periods with 0. Cumulative starts from `baseline`. */
export function buildSeries(entries: Entry[], range: DateRange, g: Granularity, metric: Metric, baseline = 0): SeriesPoint[] {
  const byPeriod = rollup(
    entries,
    v => sum(v, e => e.duration) / 3600,
    e => toKey(startOfPeriod(parseDay(e.date), g)),
  );

  const series: SeriesPoint[] = [];
  const end = parseDay(range.to);
  let running = baseline;
  for (let d = startOfPeriod(parseDay(range.from), g); d <= end; d = nextPeriod(d, g)) {
    const key = toKey(d);
    const hours = byPeriod.get(key) ?? 0;
    running += hours;
    series.push({ key, date: d, hours: metric === 'cumulative' ? running : hours });
  }
  return series;
}

export function hoursByProject(entries: Entry[]) {
  return rollup(entries, v => sum(v, e => e.duration) / 3600, e => e.project_id);
}

export function hoursByDay(entries: Entry[]) {
  return rollup(entries, v => sum(v, e => e.duration) / 3600, e => e.date);
}

export const cycleLength = (c: Cycle) => (c === 'day' ? 24 : 168);

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Label for a slot in a cycle: "14:00" for a day, "Tue 14:00" for a week. */
export const slotLabel = (slot: number, c: Cycle) => {
  const time = `${String(slot % 24).padStart(2, '0')}:00`;
  return c === 'day' ? time : `${WEEKDAYS[Math.floor(slot / 24)]} ${time}`;
};

export const formatDuration = (hours: number) => {
  const mins = Math.round(hours * 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
};

/** Axis tick for a duration in hours: "0", "45m", "1.5h". */
export const durationTick = (v: number) => (v === 0 ? '0' : v < 1 ? `${Math.round(v * 60)}m` : `${+v.toFixed(1)}h`);

/** Days covered by a range, inclusive. */
export const rangeDays = (r: DateRange) =>
  Math.round((parseDay(r.to).getTime() - parseDay(r.from).getTime()) / 86_400_000) + 1;

export interface Untimed {
  project_id: number;
  date: string;
  hours: number;
}

export interface Reconciled {
  sessions: Session[];
  untimed: Untimed[]; // per project-day: daily-total time with no session behind it (typed in by hand)
  trimmedHours: number; // runaway timer time removed to match daily totals
  untimedHours: number;
}

/**
 * Sessions are raw timer runs; time_entries are the daily totals the user keeps (and corrects).
 * Forgotten timers make sessions overshoot, so per project-day we cap the longest sessions first
 * until they sum to the entry, keeping start times. Time-of-day charts use the result.
 */
export function reconcileSessions(sessions: Session[], entries: Entry[]): Reconciled {
  const entrySeconds = new Map(entries.map(e => [`${e.project_id}|${e.date}`, e.duration]));
  const timedSeconds = new Map<string, number>();
  const out: Session[] = [];
  let trimmed = 0;

  for (const [key, list] of group(sessions, s => `${s.project_id}|${s.date}`)) {
    const target = entrySeconds.get(key) ?? 0;
    const total = sum(list, s => s.duration);
    if (total <= target) {
      out.push(...list);
      timedSeconds.set(key, total);
      continue;
    }
    // Water-fill: find cap L so that sum(min(duration, L)) === target
    const sorted = list.map(s => s.duration).sort((a, b) => a - b);
    let remaining = target;
    let cap = 0;
    for (let i = 0; i < sorted.length; i++) {
      const n = sorted.length - i;
      if (sorted[i] * n >= remaining) { cap = remaining / n; break; }
      remaining -= sorted[i];
    }
    for (const s of list) {
      const duration = Math.min(s.duration, cap);
      if (duration > 0) out.push({ ...s, duration });
    }
    trimmed += total - target;
    timedSeconds.set(key, target);
  }

  const untimed: Untimed[] = [];
  for (const e of entries) {
    const rest = e.duration - (timedSeconds.get(`${e.project_id}|${e.date}`) ?? 0);
    if (rest > 0) untimed.push({ project_id: e.project_id, date: e.date, hours: rest / 3600 });
  }
  return { sessions: out, untimed, trimmedHours: trimmed / 3600, untimedHours: sum(untimed, u => u.hours) };
}

export interface Profile {
  total: number[];
  byProject: Map<number, number[]>;
}
/** Hours per slot of a day (24) or week (168), overall and per project; sessions are split across the slots they span. */
export function cycleProfile(sessions: Session[], c: Cycle): Profile {
  const n = cycleLength(c);
  const total = new Array<number>(n).fill(0);
  const byProject = new Map<number, number[]>();
  for (const s of sessions) {
    let row = byProject.get(s.project_id);
    if (!row) byProject.set(s.project_id, (row = new Array<number>(n).fill(0)));
    let t = new Date(s.start_time).getTime();
    const end = t + s.duration * 1000;
    while (t < end) {
      const at = new Date(t);
      const hourEnd = new Date(at.getFullYear(), at.getMonth(), at.getDate(), at.getHours() + 1).getTime();
      const hours = (Math.min(hourEnd, end) - t) / 3_600_000;
      const slot = c === 'day' ? at.getHours() : ((at.getDay() + 6) % 7) * 24 + at.getHours();
      total[slot] += hours;
      row[slot] += hours;
      t = Math.min(hourEnd, end);
    }
  }
  return { total, byProject };
}

/**
 * Hand-entered time has a date but no clock time. Place it on its real weekday, spread across the
 * hours that project is usually worked on that weekday (falling back to its usual hours on any day,
 * then to everyone's). `habits` is a week profile (168 slots) of timed work.
 */
export function placeUntimed(untimed: Untimed[], habits: Profile): Profile {
  const total = new Array<number>(168).fill(0);
  const byProject = new Map<number, number[]>();
  const anyDay = (row: number[]) => Array.from({ length: 24 }, (_, h) => sum(WEEKDAYS, (_d, d) => row[d * 24 + h]));
  const globalHours = anyDay(habits.total);

  for (const u of untimed) {
    const d = (parseDay(u.date).getDay() + 6) % 7;
    const habit = habits.byProject.get(u.project_id);
    const candidates = habit ? [habit.slice(d * 24, d * 24 + 24), anyDay(habit), globalHours] : [globalHours];
    const weights = candidates.find(w => sum(w) > 0) ?? new Array<number>(24).fill(1);
    const weightSum = sum(weights);

    let row = byProject.get(u.project_id);
    if (!row) byProject.set(u.project_id, (row = new Array<number>(168).fill(0)));
    weights.forEach((w, h) => {
      const hours = (u.hours * w) / weightSum;
      total[d * 24 + h] += hours;
      row[d * 24 + h] += hours;
    });
  }
  return { total, byProject };
}

/** Collapse a 168-slot week profile into 24 hours of the day. */
export function foldToDay(p: Profile): Profile {
  const fold = (row: number[]) => Array.from({ length: 24 }, (_, h) => sum(WEEKDAYS, (_d, d) => row[d * 24 + h]));
  return { total: fold(p.total), byProject: new Map([...p.byProject].map(([id, row]) => [id, fold(row)])) };
}

/** Add profiles slot by slot. */
export function addProfiles(a: Profile, b: Profile): Profile {
  const byProject = new Map([...a.byProject].map(([id, row]) => [id, [...row]]));
  for (const [id, row] of b.byProject) {
    const into = byProject.get(id);
    if (into) row.forEach((v, i) => { into[i] += v; });
    else byProject.set(id, [...row]);
  }
  return { total: a.total.map((v, i) => v + b.total[i]), byProject };
}

/** Monday of the week containing `date`, as YYYY-MM-DD. */
export const weekOf = (date: string) => toKey(startOfPeriod(parseDay(date), 'week'));
