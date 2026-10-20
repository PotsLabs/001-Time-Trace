import React, { useMemo, useState } from 'react';
import { type DateRange, WEEKDAYS, addDays, formatDay, formatDuration, parseDay, toKey, weekOf } from './analytics';

interface WeekScopeProps {
  year: number;
  dailyHours: Map<string, number>;
  selectedWeeks: Set<string>; // Monday keys; empty = follow the page range
  fallbackRange: DateRange;
  onChange: (weeks: Set<string>) => void;
}

// Dots fade in from 20% → 100% ink by share of the busiest day / week
const ink = (share: number) => `rgba(1, 1, 1, ${0.2 + 0.8 * share})`;

/**
 * The year in the dot language of DotCalendar, laid out a column per week: the top row is the
 * week's total, the seven rows below are its days. Click a week to scope to it, shift-click to extend.
 */
const WeekScope: React.FC<WeekScopeProps> = ({ year, dailyHours, selectedWeeks, fallbackRange, onChange }) => {
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<{ week: string; day?: string } | null>(null);
  const todayKey = toKey(new Date());

  const weeks = useMemo(() => {
    const out: { key: string; days: string[]; hours: number; month: string | null }[] = [];
    let lastMonth = -1;
    for (let start = parseDay(weekOf(`${year}-01-01`)); start.getFullYear() <= year; start = addDays(start, 7)) {
      const days = WEEKDAYS.map((_d, i) => toKey(addDays(start, i)));
      const hours = days.reduce((a, d) => a + (dailyHours.get(d) ?? 0), 0);
      // Label the first week whose Thursday falls in a new month
      const thursday = addDays(start, 3);
      const month = thursday.getFullYear() === year && thursday.getMonth() !== lastMonth
        ? thursday.toLocaleDateString('en-GB', { month: 'short' }) : null;
      if (month) lastMonth = thursday.getMonth();
      out.push({ key: toKey(start), days, hours, month });
    }
    return out;
  }, [year, dailyHours]);

  const peakDay = Math.max(1, ...weeks.flatMap(w => w.days.map(d => dailyHours.get(d) ?? 0)));
  const peakWeek = Math.max(1, ...weeks.map(w => w.hours));

  const selectWeek = (key: string, extend: boolean) => {
    if (extend && anchor) {
      const [a, b] = anchor <= key ? [anchor, key] : [key, anchor];
      onChange(new Set(weeks.filter(w => w.key >= a && w.key <= b).map(w => w.key)));
      return;
    }
    setAnchor(key);
    const next = new Set(selectedWeeks);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(next);
  };

  const sortedSelection = [...selectedWeeks].sort();
  const scopeLabel = selectedWeeks.size === 0
    ? `Following the page range: ${formatDay(parseDay(fallbackRange.from))} – ${formatDay(parseDay(fallbackRange.to))}`
    : `${selectedWeeks.size} week${selectedWeeks.size > 1 ? 's' : ''}: ${formatDay(parseDay(sortedSelection[0]))} – ${formatDay(addDays(parseDay(sortedSelection[sortedSelection.length - 1]), 6))}`;

  const hoverLabel = !hover ? 'Click a week to scope the lines · shift-click to select a run of weeks'
    : hover.day
      ? `${formatDay(parseDay(hover.day))} · ${formatDuration(dailyHours.get(hover.day) ?? 0)}`
      : `Week of ${formatDay(parseDay(hover.week))} · ${formatDuration(weeks.find(w => w.key === hover.week)?.hours ?? 0)}`;

  return (
    <div className="week-scope">
      <div className="calendar-info">
        <div className="info-left">
          <div className="info-subtitle">{scopeLabel}</div>
          <div className="info-date">{hoverLabel}</div>
        </div>
        <div className="viz-control-group">
          <button className="toggle-view-button" onClick={() => onChange(new Set(weeks.filter(w => w.key <= todayKey).slice(-4).map(w => w.key)))}>Last 4 weeks</button>
          <button className="toggle-view-button" disabled={selectedWeeks.size === 0} onClick={() => onChange(new Set())}>Use page range</button>
        </div>
      </div>

      <div className="week-grid" style={{ gridTemplateColumns: `28px repeat(${weeks.length}, 1fr)` }}>
        {/* Month labels */}
        <span />
        {weeks.map(w => <span key={w.key} className="week-month">{w.month ?? ''}</span>)}

        {/* Week totals */}
        <span className="week-row-label week-total">Wk</span>
        {weeks.map(w => {
          const selected = selectedWeeks.has(w.key);
          const future = w.key > todayKey;
          return (
            <button key={w.key} className={`week-cell week-total ${selected ? 'selected' : ''}`}
              onClick={e => selectWeek(w.key, e.shiftKey)}
              onMouseEnter={() => setHover({ week: w.key })} onMouseLeave={() => setHover(null)}>
              <i className={`dot week-dot ${w.days.includes(todayKey) ? 'current' : ''} ${future ? 'future' : ''}`}
                style={w.hours > 0 && !selected ? { backgroundColor: ink(w.hours / peakWeek) } : undefined} />
            </button>
          );
        })}

        {/* Days, one row per weekday */}
        {WEEKDAYS.map((label, d) => (
          <React.Fragment key={label}>
            <span className="week-row-label">{d % 2 === 0 ? label.slice(0, 1) : ''}</span>
            {weeks.map(w => {
              const day = w.days[d];
              const hours = dailyHours.get(day) ?? 0;
              const outside = parseDay(day).getFullYear() !== year;
              return (
                <button key={day} className={`week-cell ${selectedWeeks.has(w.key) ? 'selected' : ''}`}
                  onClick={e => selectWeek(w.key, e.shiftKey)}
                  onMouseEnter={() => setHover({ week: w.key, day })} onMouseLeave={() => setHover(null)}>
                  <i className={`dot ${day === todayKey ? 'current' : ''} ${day > todayKey || outside ? 'future' : ''}`}
                    style={hours > 0 ? { backgroundColor: ink(hours / peakDay) } : undefined} />
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default WeekScope;
