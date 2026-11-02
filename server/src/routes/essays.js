import { Router } from 'express';
import { countWords } from '../reuse.js';
import { clearSuggestionsFor, runReuseEngine } from '../services.js';

const STATUSES = ['not_started', 'drafting', 'complete'];

export function essaysRouter(db) {
  const r = Router();

  const assignmentsFor = (essayId) =>
    db
      .prepare(
        `SELECT r.id, r.title, r.word_limit, c.id AS college_id, c.name AS college_name
           FROM essay_assignments ea
           JOIN requirements r ON r.id = ea.requirement_id
           JOIN colleges c ON c.id = r.college_id
          WHERE ea.essay_id = ? ORDER BY c.name`,
      )
      .all(essayId);

  const load = (id, userId) => {
    const essay = db.prepare('SELECT * FROM essays WHERE id = ? AND user_id = ?').get(id, userId);
    return essay && { ...essay, assignments: assignmentsFor(essay.id) };
  };

  r.get('/', (req, res) => {
    const essays = db.prepare('SELECT * FROM essays WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);
    res.json({ essays: essays.map((e) => ({ ...e, assignments: assignmentsFor(e.id) })) });
  });

  r.get('/:id', (req, res) => {
    const essay = load(req.params.id, req.user.id);
    if (!essay) return res.status(404).json({ error: 'Essay not found' });
    res.json({ essay });
  });

  r.post('/', (req, res) => {
    const { title, content = '', requirement_id } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    const { lastInsertRowid: id } = db
      .prepare('INSERT INTO essays (user_id, title, content, word_count, status) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, title.trim(), content, countWords(content), content ? 'drafting' : 'not_started');
    const target =
      requirement_id &&
      db
        .prepare("SELECT id FROM requirements WHERE id = ? AND type = 'essay' AND (created_by IS NULL OR created_by = ?)")
        .get(requirement_id, req.user.id);
    if (target) db.prepare('INSERT OR IGNORE INTO essay_assignments (essay_id, requirement_id) VALUES (?, ?)').run(id, target.id);
    res.status(201).json({ essay: load(id, req.user.id) });
  });

  // PATCH { title?, content?, status? }. Changing status to 'complete' runs the reuse engine.
  r.patch('/:id', (req, res) => {
    const essay = db.prepare('SELECT * FROM essays WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!essay) return res.status(404).json({ error: 'Essay not found' });
    const { title, content, status } = req.body || {};
    if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });

    const next = {
      title: title?.trim() || essay.title,
      content: content ?? essay.content,
      status: status ?? essay.status,
    };
    db.prepare(
      "UPDATE essays SET title = ?, content = ?, word_count = ?, status = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(next.title, next.content, countWords(next.content), next.status, essay.id);

    let suggestions = [];
    if (next.status === 'complete') suggestions = runReuseEngine(db, req.user.id, essay.id);
    else if (essay.status === 'complete') clearSuggestionsFor(db, req.user.id, essay.id);
    res.json({ essay: load(essay.id, req.user.id), suggestions });
  });

  r.delete('/:id', (req, res) => {
    clearSuggestionsFor(db, req.user.id, Number(req.params.id));
    db.prepare('DELETE FROM essays WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ ok: true });
  });

  // POST /api/essays/:id/assign { requirement_id }
  r.post('/:id/assign', (req, res) => {
    const essay = db.prepare('SELECT * FROM essays WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!essay) return res.status(404).json({ error: 'Essay not found' });
    const reqRow = db
      .prepare("SELECT * FROM requirements WHERE id = ? AND type = 'essay' AND (created_by IS NULL OR created_by = ?)")
      .get(req.body?.requirement_id, req.user.id);
    if (!reqRow) return res.status(404).json({ error: 'Essay requirement not found' });
    db.prepare('INSERT OR IGNORE INTO essay_assignments (essay_id, requirement_id) VALUES (?, ?)').run(essay.id, reqRow.id);
    const suggestions = essay.status === 'complete' ? runReuseEngine(db, req.user.id, essay.id) : [];
    res.json({ essay: load(essay.id, req.user.id), suggestions });
  });

  r.delete('/:id/assign/:requirementId', (req, res) => {
    const essay = db.prepare('SELECT id FROM essays WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!essay) return res.status(404).json({ error: 'Essay not found' });
    db.prepare('DELETE FROM essay_assignments WHERE essay_id = ? AND requirement_id = ?').run(essay.id, req.params.requirementId);
    res.json({ essay: load(essay.id, req.user.id) });
  });

  return r;
}
