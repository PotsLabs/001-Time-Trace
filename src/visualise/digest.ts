import { group, median, rollup, sum } from 'd3-array';
import {
  type Entry, type Profile, type Project, type Reconciled, type Session,
  WEEKDAYS, addDays, foldToDay, parseDay, rangeDays, toKey, weekOf,
} from './analytics';

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const clock = (hours: number) => {
  const minutes = ((Math.round(hours * 60) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

// A work day runs 05:00–05:00, so a session at 00:30 belongs to the evening before it
const DAY_START_HOUR = 5;
const DAYPARTS = [
  { part: 'Morning 05–12', from: 5, to: 12 },
  { part: 'Afternoon 12–18', from: 12, to: 18 },
  { part: 'Evening 18–24', from: 18, to: 24 },
  { part: 'Night 00–05', from: 24, to: 29 },
];

/** How regular the working rhythm is, from timed sessions (already trimmed of runaway timers). */
function cadenceOf(sessions: Session[], entries: Entry[]) {
  const workDays = group(sessions, s => {
    const start = new Date(new Date(s.start_time).getTime() - DAY_START_HOUR * 3_600_000);
    return toKey(start);
  });

  const starts: number[] = [];
  const ends: number[] = [];
  const partDays = DAYPARTS.map(() => 0);
  for (const [day, list] of workDays) {
    const dayStart = parseDay(day).getTime() + DAY_START_HOUR * 3_600_000;
    // Hours since midnight of the work day (can run past 24 into the small hours)
    const spans = list.map(s => {
      const from = (new Date(s.start_time).getTime() - dayStart) / 3_600_000 + DAY_START_HOUR;
      return [from, from + s.duration / 3600];
    });
    starts.push(Math.min(...spans.map(([a]) => a)));
    ends.push(Math.max(...spans.map(([, b]) => b)));
    DAYPARTS.forEach((p, i) => {
      const overlap = sum(spans, ([a, b]) => Math.max(0, Math.min(b, p.to) - Math.max(a, p.from)));
      if (overlap >= 0.25) partDays[i]++;
    });
  }

  const byWeek = rollup(entries, v => sum(v, e => e.duration) / 3600, e => weekOf(e.date));
  const daysByWeek = rollup(entries, v => new Set(v.map(e => e.date)).size, e => weekOf(e.date));
  const weeks = [...byWeek.values()];
  const medianWeek = median(weeks) ?? 0;
  const weekCount = Math.max(1, weeks.length);

  return {
    timedWorkDays: workDays.size,
    typicalStart: clock(median(starts) ?? 0),
    typicalEnd: clock(median(ends) ?? 0),
    medianHoursPerActiveDay: r1(median(rollup(entries, v => sum(v, e => e.duration) / 3600, e => e.date).values()) ?? 0),
    shareOfWorkDaysWithEachDaypart: DAYPARTS.map((p, i) => ({ part: p.part, pctOfWorkDays: pct(partDays[i], workDays.size) })),
    shareOfWeeksEachWeekdayIsWorked: WEEKDAYS.map((day, i) => ({
      day,
      pctOfWeeks: pct(new Set(entries.filter(e => (parseDay(e.date).getDay() + 6) % 7 === i).map(e => weekOf(e.date))).size, weekCount),
    })),
    weeklyHours: {
      median: r1(medianWeek),
      lowest: r1(Math.min(...weeks)),
      highest: r1(Math.max(...weeks)),
      pctOfWeeksWithin20PctOfMedian: pct(weeks.filter(w => Math.abs(w - medianWeek) <= medianWeek * 0.2).length, weekCount),
    },
    medianActiveDaysPerWeek: median(daysByWeek.values()) ?? 0,
  };
}

/**
 * A compact, numbers-only picture of all tracked time: the page's summary stats are read straight
 * from it, and it's what the model sees. `week` is the 168-slot profile of timed + placed hand-entered work.
 */
export function buildDigest(projects: Project[], entries: Entry[], sessions: Session[], reconciled: Reconciled, week: Profile) {
  const hours = (list: Entry[]) => sum(list, e => e.duration) / 3600;
  const todayKey = toKey(new Date());
  const daysBack = (n: number) => toKey(addDays(new Date(), -n));

  const activeDays = [...new Set(entries.map(e => e.date))].sort();
  const total = hours(entries);
  const spanDays = activeDays.length ? rangeDays({ from: activeDays[0], to: todayKey }) : 1;
  const last28 = hours(entries.filter(e => e.date > daysBack(28)));
  const prior28 = hours(entries.filter(e => e.date > daysBack(56) && e.date <= daysBack(28)));

  const projectRows = projects
    .map(p => {
      const own = entries.filter(e => e.project_id === p.id);
      const h = hours(own);
      return {
        name: p.name,
        hours: r1(h),
        sharePct: pct(h, total),
        activeDays: new Set(own.map(e => e.date)).size,
        estimateHours: p.estimate_hours,
        pctOfEstimate: p.estimate_hours ? pct(h, p.estimate_hours) : null,
        last28Days: r1(hours(own.filter(e => e.date > daysBack(28)))),
        lastWorked: own.map(e => e.date).sort().pop() ?? null,
      };
    })
    .filter(p => p.hours > 0)
    .sort((a, b) => b.hours - a.hours);

  const day = foldToDay(week);
  const hourRows = day.total.map((h, i) => ({ hour: clock(i), hours: r1(h), sharePct: pct(h, sum(day.total)) }));
  const weekdayRows = WEEKDAYS.map((d, i) => ({ day: d, hours: r1(sum(week.total.slice(i * 24, i * 24 + 24))) }));
  const byHours = <T extends { hours: number }>(rows: T[]) => [...rows].sort((a, b) => b.hours - a.hours);

  return {
    today: todayKey,
    span: { first: activeDays[0] ?? null, calendarDays: spanDays, activeDays: activeDays.length },
    averages: {
      hoursPerActiveDay: r1(total / Math.max(1, activeDays.length)),
      hoursPerWeek: r1(total / Math.max(1, spanDays / 7)),
      hoursPerMonth: r1(total / Math.max(1, spanDays / 30.44)),
      activeDaysPerWeek: r1(activeDays.length / Math.max(1, spanDays / 7)),
    },
    busiestTimes: { hours: byHours(hourRows).slice(0, 3), weekday: byHours(weekdayRows)[0] },
    quietestTimes: { hours: byHours(hourRows).slice(-3).reverse(), weekday: byHours(weekdayRows).pop() },
    topProjects: projectRows.slice(0, 5).map(({ name, hours, sharePct }) => ({ name, hours, sharePct })),
    fewestActiveDays: [...projectRows].sort((a, b) => a.activeDays - b.activeDays).slice(0, 3)
      .map(({ name, activeDays, hours }) => ({ name, activeDays, hours })),
    cadence: cadenceOf(reconciled.sessions, entries),
    totals: {
      hours: r1(total),
      handEnteredHours: r1(reconciled.untimedHours),
      runawayTimerHoursRemoved: r1(reconciled.trimmedHours),
      timerSessions: sessions.length,
    },
    recent: { last28Days: r1(last28), prior28Days: r1(prior28), changePct: prior28 ? pct(last28 - prior28, prior28) : null },
    estimates: {
      atOrOver: projectRows.filter(p => (p.pctOfEstimate ?? 0) >= 100).map(p => `${p.name} (${p.pctOfEstimate}%)`),
      nearing: projectRows.filter(p => (p.pctOfEstimate ?? 0) >= 75 && (p.pctOfEstimate ?? 0) < 100).map(p => `${p.name} (${p.pctOfEstimate}%)`),
    },
    notWorkedInLast28Days: projectRows.filter(p => p.lastWorked && p.lastWorked <= daysBack(28)).map(p => `${p.name} (last ${p.lastWorked})`),
    projects: projectRows,
    hoursByHourOfDay: hourRows.map(h => h.hours), // index = hour, local 24h; hand-entered time spread over usual hours
    hoursByWeekday: weekdayRows,
  };
}

export type Digest = ReturnType<typeof buildDigest>;
