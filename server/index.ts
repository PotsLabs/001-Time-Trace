import express from 'express';
import cors from 'cors';
import path from 'path';
import db from './db.js';

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
};

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

// Fallback: serve index.html for any non-API route (SPA support)
if (staticPath) {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`Time-Trace server running on http://localhost:${PORT}`));
