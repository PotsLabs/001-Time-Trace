import express from 'express';
import cors from 'cors';
import path from 'path';
import { createHash } from 'crypto';
import db from './db.js';

// Settings (SUMMARY_PROVIDER, OLLAMA_MODEL, ANTHROPIC_API_KEY…) come from a .env: the project root in dev, the app-data folder when packaged
try {
  process.loadEnvFile(process.env.ENV_FILE ?? '.env');
} catch {
  // no .env — the summary endpoint reports the missing key
}

// Summary model: a local Ollama model by default; set SUMMARY_PROVIDER=anthropic (+ ANTHROPIC_API_KEY) to use Claude
const SUMMARY_PROVIDER = process.env.SUMMARY_PROVIDER ?? 'ollama';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const SUMMARY_MODEL = SUMMARY_PROVIDER === 'anthropic'
  ? process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5'
  : process.env.OLLAMA_MODEL ?? 'qwen2.5:7b-instruct';

const app = express();
app.use(cors());
app.use(express.json());

// In production (packaged Electron app), serve the built React frontend
const staticPath = process.env.STATIC_PATH;
if (staticPath) {
  app.use(express.static(staticPath));
}

// Pre-compiled statements — parsed once at startup, reused on every request
const stmts = {
  listProjects:   db.prepare("SELECT * FROM projects WHERE status = 'active'"),
  insertProject:  db.prepare("INSERT INTO projects (name, description, estimate_hours) VALUES (?, ?, ?) RETURNING *"),
  getProject:     db.prepare('SELECT * FROM projects WHERE id = ?'),
  updateProject:  db.prepare("UPDATE projects SET name=?, description=?, estimate_hours=?, updated_at=datetime('now') WHERE id=? RETURNING *"),

  upsertTimeEntry: db.prepare(`
    INSERT INTO time_entries (project_id, date, duration) VALUES (?, ?, ?)
    ON CONFLICT(project_id, date) DO UPDATE SET duration=excluded.duration, updated_at=datetime('now')
  `),
  getTimeEntry:   db.prepare('SELECT * FROM time_entries WHERE project_id=? AND date=?'),

  insertSession:  db.prepare('INSERT INTO sessions (project_id, date, start_time, end_time, duration) VALUES (?, ?, ?, ?, ?) RETURNING *'),
  sessionsByDate: db.prepare('SELECT * FROM sessions WHERE date = ? ORDER BY start_time ASC'),
  allSessions:    db.prepare('SELECT * FROM sessions ORDER BY start_time ASC'),

  allProjects:    db.prepare('SELECT id, name, estimate_hours, status FROM projects ORDER BY id'),
  entriesInRange: db.prepare('SELECT project_id, date, duration FROM time_entries WHERE date BETWEEN ? AND ? AND duration > 0 ORDER BY date'),
  sessionsInRange: db.prepare('SELECT project_id, date, start_time, duration FROM sessions WHERE date BETWEEN ? AND ? ORDER BY start_time'),

  listCallouts:   db.prepare('SELECT * FROM callouts ORDER BY date'),
  insertCallout:  db.prepare('INSERT INTO callouts (date, label, note, tone, dx, dy) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'),
  updateCallout:  db.prepare('UPDATE callouts SET date=?, label=?, note=?, tone=?, dx=?, dy=? WHERE id=? RETURNING *'),
  deleteCallout:  db.prepare('DELETE FROM callouts WHERE id = ?'),

  latestSummary:  db.prepare('SELECT * FROM summaries ORDER BY id DESC LIMIT 1'),
  insertSummary:  db.prepare('INSERT INTO summaries (data_hash, model, content) VALUES (?, ?, ?) RETURNING *'),
};

interface SummaryRow {
  data_hash: string;
  model: string;
  content: string;
  created_at: string;
}

const SUMMARY_PROMPT = `You are the analyst inside Time Trace, a personal time-tracking app. You receive a JSON digest of all of the user's tracked time. Write a note on their working cadence: what the data says their most consistent patterns are.

Rules:
- Use only figures that appear in the digest, copied exactly. Never add, average or otherwise compute new numbers.
- "cadence" is the main source for consistency: typical start and end of the working day, how often each part of the day is worked, how regularly each weekday is worked, and how steady weekly hours are.
- Describe what repeats, not one-off events. A "week" is not a "day"; keep units as the digest gives them.
- No advice. Write to the user as "you". Times are local, 24h.

Respond with JSON only:
{"headline": "one sentence, at most 20 words, naming the strongest pattern", "cadence": "2 to 4 sentences describing the overall rhythm", "patterns": [{"title": "at most 5 words", "detail": "one sentence citing figures"}]}
Give 3 or 4 patterns.`;

const ASK_PROMPT = `You are the analyst inside Time Trace, a personal time-tracking app. Answer the user's question about their tracked time using only the JSON digest provided. Quote figures exactly as they appear; never invent or compute new numbers. If the digest can't answer the question, say what it does show instead. Be brief: at most 4 sentences or a short list. Times are local, 24h. Write to the user as "you".`;

// Shape the summary must take; Ollama enforces it as a JSON schema
const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    cadence: { type: 'string' },
    patterns: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, detail: { type: 'string' } },
        required: ['title', 'detail'],
      },
    },
  },
  required: ['headline', 'cadence', 'patterns'],
};

class MissingKeyError extends Error {}

interface CompleteOptions {
  format?: object; // JSON schema (Ollama only)
  onToken?: (text: string) => void; // stream tokens as they arrive
}

async function ollamaComplete(system: string, user: string, { format, onToken }: CompleteOptions) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: SUMMARY_MODEL,
      stream: !!onToken,
      format,
      // Ollama's default context is small enough to silently truncate the digest
      options: { temperature: 0.3, num_ctx: 16384 },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  }).catch(() => {
    throw new Error(`Ollama isn't reachable at ${OLLAMA_URL}. Is it running?`);
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Ollama ${res.status}`);
  if (!onToken) return ((await res.json()).message?.content ?? '') as string;

  // Streaming: newline-delimited JSON chunks
  let text = '';
  let buffered = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffered += decoder.decode(chunk, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const token = JSON.parse(line).message?.content ?? '';
      text += token;
      onToken(token);
    }
  }
  return text;
}

async function anthropicComplete(system: string, user: string, { onToken }: CompleteOptions) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new MissingKeyError();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: SUMMARY_MODEL, max_tokens: 1500, system, messages: [{ role: 'user', content: user }] }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `Anthropic API ${res.status}`);
  const text: string = body.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '';
  onToken?.(text);
  return text;
}

const complete = (system: string, user: string, options: CompleteOptions = {}) =>
  SUMMARY_PROVIDER === 'anthropic' ? anthropicComplete(system, user, options) : ollamaComplete(system, user, options);

async function writeSummary(digest: unknown) {
  const text = await complete(SUMMARY_PROMPT, JSON.stringify(digest), { format: SUMMARY_SCHEMA });
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const parsed = JSON.parse(json); // reject anything that isn't the requested shape before caching it
  if (typeof parsed.headline !== 'string' || typeof parsed.cadence !== 'string' || !Array.isArray(parsed.patterns)) {
    throw new Error('Summary came back in the wrong shape');
  }
  return json;
}

const summaryResponse = (row: SummaryRow, stale: boolean) =>
  ({ ...JSON.parse(row.content), model: row.model, created_at: row.created_at, stale });

// GET /api/projects
app.get('/api/projects', (_req, res) => {
  res.json(stmts.listProjects.all());
});

// POST /api/projects
app.post('/api/projects', (req, res) => {
  const { name, description, estimate_hours } = req.body;
  const project = stmts.insertProject.get(name, description ?? null, estimate_hours ?? 0);
  res.json(project);
});

// PUT /api/projects/:id
app.put('/api/projects/:id', (req, res) => {
  const { name, description, estimate_hours } = req.body;
  const project = stmts.updateProject.get(name, description ?? null, estimate_hours ?? 0, req.params.id);
  res.json(project);
});

// GET /api/time-entries?project_ids=1,2,3
app.get('/api/time-entries', (req, res) => {
  const ids = req.query.project_ids as string;
  if (!ids) return res.json([]);
  const idList = ids.split(',').map(Number).filter(Boolean);
  if (idList.length === 0) return res.json([]);
  const placeholders = idList.map(() => '?').join(',');
  const entries = db.prepare(`SELECT * FROM time_entries WHERE project_id IN (${placeholders})`).all(...idList);
  res.json(entries);
});

// PUT /api/time-entries (upsert by project_id + date)
app.put('/api/time-entries', (req, res) => {
  const { project_id, date, duration } = req.body;
  stmts.upsertTimeEntry.run(project_id, date, duration);
  res.json(stmts.getTimeEntry.get(project_id, date));
});

// POST /api/sessions — record a completed timer session
app.post('/api/sessions', (req, res) => {
  const { project_id, date, start_time, end_time, duration } = req.body;
  const session = stmts.insertSession.get(project_id, date, start_time, end_time, duration);
  res.json(session);
});

// GET /api/sessions?date=YYYY-MM-DD  (or omit date for all sessions)
app.get('/api/sessions', (req, res) => {
  const { date } = req.query;
  res.json(date ? stmts.sessionsByDate.all(date) : stmts.allSessions.all());
});

// GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
// Raw daily rows; slicing and period aggregation happen client-side so filters are instant.
app.get('/api/analytics', (req, res) => {
  const from = (req.query.from as string) || '0000-01-01';
  const to = (req.query.to as string) || '9999-12-31';
  res.json({
    projects: stmts.allProjects.all(),
    entries: stmts.entriesInRange.all(from, to),
    sessions: stmts.sessionsInRange.all(from, to),
  });
});

// Chart callouts (user-authored annotations pinned to a date)
app.get('/api/callouts', (_req, res) => {
  res.json(stmts.listCallouts.all());
});

app.post('/api/callouts', (req, res) => {
  const { date, label, note, tone, dx, dy } = req.body;
  res.json(stmts.insertCallout.get(date, label, note ?? null, tone ?? 'primary', dx ?? 30, dy ?? -40));
});

app.put('/api/callouts/:id', (req, res) => {
  const { date, label, note, tone, dx, dy } = req.body;
  res.json(stmts.updateCallout.get(date, label, note ?? null, tone ?? 'primary', dx ?? 30, dy ?? -40, req.params.id));
});

app.delete('/api/callouts/:id', (req, res) => {
  stmts.deleteCallout.run(req.params.id);
  res.json({ ok: true });
});

// POST /api/summary { digest, force? } — AI read of all tracked time.
// Serves the cached summary (flagged stale if the data changed) unless forced or none exists yet.
app.post('/api/summary', async (req, res) => {
  const { digest, force } = req.body;
  const hash = createHash('sha256').update(JSON.stringify(digest)).digest('hex');
  const latest = stmts.latestSummary.get() as SummaryRow | undefined;
  const current = latest && 'cadence' in JSON.parse(latest.content) ? latest : undefined; // skip older summary shapes
  if (current && !force) return res.json(summaryResponse(current, current.data_hash !== hash));

  try {
    const content = await writeSummary(digest);
    const row = stmts.insertSummary.get(hash, SUMMARY_MODEL, content) as SummaryRow;
    res.json(summaryResponse(row, false));
  } catch (e) {
    if (e instanceof MissingKeyError) return res.status(503).json({ error: 'missing_key' });
    res.status(502).json({ error: (e as Error).message });
  }
});

// POST /api/ask { digest, question } — streams a plain-text answer grounded in the digest
app.post('/api/ask', async (req, res) => {
  const { digest, question } = req.body;
  if (typeof question !== 'string' || !question.trim()) return res.status(400).json({ error: 'Ask a question' });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  try {
    await complete(ASK_PROMPT, `Digest:\n${JSON.stringify(digest)}\n\nQuestion: ${question.trim()}`, {
      onToken: token => res.write(token),
    });
    res.end();
  } catch (e) {
    const message = e instanceof MissingKeyError ? 'No ANTHROPIC_API_KEY is configured.' : (e as Error).message;
    if (!res.headersSent) res.status(502);
    res.end(res.headersSent ? `\n\n(Stopped: ${message})` : message);
  }
});

// Fallback: serve index.html for any non-API route (SPA support)
if (staticPath) {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`Time-Trace server running on http://localhost:${PORT}`));
