import React, { useEffect, useState } from 'react';
import { formatDuration } from './analytics';
import type { Digest } from './digest';

interface Summary {
  headline: string;
  cadence: string;
  patterns: { title: string; detail: string }[];
  created_at: string;
  model: string;
  stale: boolean;
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; summary: Summary }
  | { status: 'missing_key' }
  | { status: 'error'; message: string };

interface Turn {
  question: string;
  answer: string;
  done: boolean;
}

const SUGGESTED_QUESTIONS = [
  'When do I do my most focused work?',
  'Which projects have I neglected lately?',
  'How consistent are my weekends?',
];

async function requestSummary(digest: Digest, force: boolean): Promise<State> {
  try {
    const res = await fetch('/api/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ digest, force }),
    });
    const body = await res.json();
    if (res.ok) return { status: 'ready', summary: body };
    if (body.error === 'missing_key') return { status: 'missing_key' };
    return { status: 'error', message: body.error ?? res.statusText };
  } catch (e) {
    return { status: 'error', message: (e as Error).message };
  }
}

const Stat: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div className="viz-kpi">
    <div className="viz-kpi-value summary-stat-value">{value}</div>
    <div className="viz-kpi-label">{label}</div>
  </div>
);

/** All-time stats (computed), the model's note on working cadence, and a box to ask the model about the data. */
const SummaryCard: React.FC<{ digest: Digest }> = ({ digest }) => {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);

  useEffect(() => {
    let live = true;
    requestSummary(digest, false).then(next => { if (live) setState(next); });
    return () => { live = false; };
  }, [digest]);

  const refresh = () => {
    setState({ status: 'loading' });
    requestSummary(digest, true).then(setState);
  };

  const updateLast = (patch: (t: Turn) => Partial<Turn>) =>
    setTurns(prev => prev.map((t, i) => (i === prev.length - 1 ? { ...t, ...patch(t) } : t)));

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || turns.some(t => !t.done)) return;
    setQuestion('');
    setTurns(prev => [...prev, { question: text, answer: '', done: false }]);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digest, question: text }),
      });
      if (!res.ok || !res.body) {
        const message = await res.text();
        updateLast(() => ({ answer: `Couldn't answer: ${message}`, done: true }));
        return;
      }
      // The answer streams in as the model writes it
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        updateLast(t => ({ answer: t.answer + chunk }));
      }
      updateLast(() => ({ done: true }));
    } catch (e) {
      updateLast(() => ({ answer: `Couldn't answer: ${(e as Error).message}`, done: true }));
    }
  };

  const busy = turns.some(t => !t.done);
  const { averages, busiestTimes, quietestTimes, topProjects, fewestActiveDays } = digest;

  return (
    <section className="viz-summary">
      <div className="viz-section-header">
        <h2 className="calendar-title">Summary</h2>
        <span className="text-secondary">All time · since {digest.span.first}</span>
      </div>

      {/* Averages */}
      <div className="viz-kpis summary-averages">
        <Stat value={formatDuration(averages.hoursPerActiveDay)} label="Avg / active day" />
        <Stat value={`${averages.hoursPerWeek}h`} label="Avg / week" />
        <Stat value={`${averages.hoursPerMonth}h`} label="Avg / month" />
        <Stat value={String(averages.activeDaysPerWeek)} label="Active days / week" />
      </div>

      {/* Key stats */}
      <div className="summary-stats">
        <div className="summary-stat-block">
          <div className="summary-insight-title">Busiest times</div>
          {busiestTimes.hours.map(h => (
            <div key={h.hour} className="summary-row"><span>{h.hour}</span><span>{h.hours}h · {h.sharePct}%</span></div>
          ))}
          <div className="summary-row"><span>{busiestTimes.weekday.day}</span><span>{busiestTimes.weekday.hours}h</span></div>
        </div>
        <div className="summary-stat-block">
          <div className="summary-insight-title">Quietest times</div>
          {quietestTimes.hours.map(h => (
            <div key={h.hour} className="summary-row"><span>{h.hour}</span><span>{h.hours}h · {h.sharePct}%</span></div>
          ))}
          {quietestTimes.weekday && (
            <div className="summary-row"><span>{quietestTimes.weekday.day}</span><span>{quietestTimes.weekday.hours}h</span></div>
          )}
        </div>
        <div className="summary-stat-block">
          <div className="summary-insight-title">Top 5 projects</div>
          {topProjects.map(p => (
            <div key={p.name} className="summary-row">
              <span className="summary-row-name">{p.name}</span><span>{p.hours}h · {p.sharePct}%</span>
            </div>
          ))}
        </div>
        <div className="summary-stat-block">
          <div className="summary-insight-title">Fewest active days</div>
          {fewestActiveDays.map(p => (
            <div key={p.name} className="summary-row">
              <span className="summary-row-name">{p.name}</span><span>{p.activeDays} {p.activeDays === 1 ? 'day' : 'days'} · {p.hours}h</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cadence note (model-written) */}
      <div className="summary-note">
        <div className="viz-section-header">
          <div className="summary-insight-title">Your working cadence</div>
          <div className="viz-control-group">
            {state.status === 'ready' && (
              <span className="text-secondary">
                {state.summary.stale ? 'Your data has changed since this was written · ' : ''}
                {state.summary.model}{' · '}
                {new Date(state.summary.created_at.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button className="toggle-view-button" disabled={state.status === 'loading'} onClick={refresh}>
              {state.status === 'loading' ? 'Writing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {state.status === 'loading' && <p className="text-secondary">Reading your tracked time… (a local model can take a minute)</p>}
        {state.status === 'missing_key' && (
          <p className="text-secondary">
            The summary is set to use Claude but no key is configured. Add <code>ANTHROPIC_API_KEY=…</code> to
            <code>.env</code>, or remove <code>SUMMARY_PROVIDER=anthropic</code> to use your local Ollama model.
          </p>
        )}
        {state.status === 'error' && <p className="text-secondary">Couldn't write the note: {state.message}</p>}
        {state.status === 'ready' && (
          <>
            <p className="summary-headline">{state.summary.headline}</p>
            <p>{state.summary.cadence}</p>
            <div className="summary-insights">
              {state.summary.patterns.map(i => (
                <div key={i.title} className="summary-insight">
                  <div className="summary-insight-title">{i.title}</div>
                  <p>{i.detail}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Ask */}
      <div className="summary-ask">
        {turns.map((t, i) => (
          <div key={i} className="ask-turn">
            <div className="ask-question">{t.question}</div>
            <p className="ask-answer">{t.answer || (t.done ? '' : 'Thinking…')}</p>
          </div>
        ))}
        <form className="ask-form" onSubmit={e => { e.preventDefault(); ask(question); }}>
          <input className="time-cell-input ask-input" value={question} placeholder="Ask about your time…"
            onChange={e => setQuestion(e.target.value)} disabled={busy} />
          <button className="toggle-view-button" type="submit" disabled={busy || !question.trim()}>Ask</button>
        </form>
        {turns.length === 0 && (
          <div className="viz-control-group ask-suggestions">
            {SUGGESTED_QUESTIONS.map(q => (
              <button key={q} className="toggle-view-button" onClick={() => ask(q)}>{q}</button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default SummaryCard;
