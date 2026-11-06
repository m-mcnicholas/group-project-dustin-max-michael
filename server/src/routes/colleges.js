import { Router } from 'express';
import { VISIBLE_COLLEGE, rerunAllReuse, requirementsWithStatus, withTopics } from '../services.js';
import { REQUIREMENT_TYPES, TOPICS, cleanTopics } from '../topics.js';

export function collegesRouter(db) {
  const r = Router();

  r.get('/topics', (req, res) => res.json({ topics: TOPICS, types: REQUIREMENT_TYPES }));

  // GET /api/colleges?search=stan
  r.get('/', (req, res) => {
    const search = `%${(req.query.search || '').trim()}%`;
    const colleges = db
      .prepare(
        `SELECT c.*, uc.id AS user_college_id
           FROM colleges c
           LEFT JOIN user_colleges uc ON uc.college_id = c.id AND uc.user_id = @userId
          WHERE ${VISIBLE_COLLEGE} AND (c.name LIKE @search OR c.location LIKE @search)
          ORDER BY c.name`,
      )
      .all({ userId: req.user.id, search });
    res.json({ colleges: colleges.map((c) => ({ ...c, on_my_list: !!c.user_college_id })) });
  });

  r.get('/:id', (req, res) => {
    const college = db
      .prepare(`SELECT c.* FROM colleges c WHERE c.id = @id AND ${VISIBLE_COLLEGE}`)
      .get({ id: req.params.id, userId: req.user.id });
    if (!college) return res.status(404).json({ error: 'College not found' });
    const mine = db.prepare('SELECT * FROM user_colleges WHERE user_id = ? AND college_id = ?').get(req.user.id, college.id);
    if (mine) {
      mine.tags = db
        .prepare('SELECT t.id, t.name, t.color FROM user_college_tags uct JOIN user_tags t ON t.id = uct.tag_id WHERE uct.user_college_id = ?')
        .all(mine.id);
    }
    // On the user's list → include per-user statuses; otherwise plain requirements.
    const requirements = mine
      ? requirementsWithStatus(db, req.user.id, [college.id])
      : withTopics(
          db,
          db
            .prepare('SELECT * FROM requirements WHERE college_id = ? AND (created_by IS NULL OR created_by = ?) ORDER BY id')
            .all(college.id, req.user.id),
        );
    res.json({ college, my: mine || null, requirements });
  });

  // Custom school, visible only to its creator.
  r.post('/', (req, res) => {
    const { name, location, platform, deadline_ed, deadline_ea, deadline_rd } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO colleges (name, location, platform, deadline_ed, deadline_ea, deadline_rd, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(name, location || null, platform || 'own', deadline_ed || null, deadline_ea || null, deadline_rd || null, req.user.id);
    res.status(201).json({ college: db.prepare('SELECT * FROM colleges WHERE id = ?').get(lastInsertRowid) });
  });

  // Custom requirement/prompt. Allowed on any visible college; only the creator sees it.
  r.post('/:id/requirements', (req, res) => {
    const college = db
      .prepare(`SELECT c.* FROM colleges c WHERE c.id = @id AND ${VISIBLE_COLLEGE}`)
      .get({ id: req.params.id, userId: req.user.id });
    if (!college) return res.status(404).json({ error: 'College not found' });
    const { type = 'essay', title, prompt_text, word_limit, optional, topics } = req.body || {};
    if (!REQUIREMENT_TYPES.includes(type)) return res.status(400).json({ error: `type must be one of ${REQUIREMENT_TYPES.join(', ')}` });
    if (!title) return res.status(400).json({ error: 'title is required' });
    const insert = db.transaction(() => {
      const { lastInsertRowid: id } = db
        .prepare(
          `INSERT INTO requirements (college_id, type, title, prompt_text, word_limit, optional, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(college.id, type, title, prompt_text || null, word_limit || null, optional ? 1 : 0, req.user.id);
      const addTopic = db.prepare('INSERT INTO requirement_topics (requirement_id, topic) VALUES (?, ?)');
      for (const t of cleanTopics(topics)) addTopic.run(id, t);
      return id;
    });
    const id = insert();
    res.status(201).json({ requirement: withTopics(db, [db.prepare('SELECT * FROM requirements WHERE id = ?').get(id)])[0] });
  });

  // ---- Edit / delete: only things the user created (curated data is read-only) ----

  const ownCollege = (req) => db.prepare('SELECT * FROM colleges WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  const ownRequirement = (req) =>
    db
      .prepare('SELECT * FROM requirements WHERE id = ? AND college_id = ? AND created_by = ?')
      .get(req.params.reqId, req.params.id, req.user.id);

  // PATCH /api/colleges/:id  { name?, location?, platform?, deadline_ed?, deadline_ea?, deadline_rd? }
  r.patch('/:id', (req, res) => {
    const college = ownCollege(req);
    if (!college) return res.status(404).json({ error: 'Custom college not found (only schools you created can be edited)' });
    const body = req.body || {};
    if (body.name !== undefined && !String(body.name).trim()) return res.status(400).json({ error: 'name cannot be empty' });
    const pick = (k) => (body[k] === undefined ? college[k] : body[k] || null);
    db.prepare(
      `UPDATE colleges SET name = ?, location = ?, platform = ?, deadline_ed = ?, deadline_ea = ?, deadline_rd = ? WHERE id = ?`,
    ).run(
      body.name !== undefined ? String(body.name).trim() : college.name,
      pick('location'),
      pick('platform') || 'own',
      pick('deadline_ed'),
      pick('deadline_ea'),
      pick('deadline_rd'),
      college.id,
    );
    res.json({ college: db.prepare('SELECT * FROM colleges WHERE id = ?').get(college.id) });
  });

  // DELETE /api/colleges/:id. Cascades to its requirements, list entries and essay assignments.
  r.delete('/:id', (req, res) => {
    const college = ownCollege(req);
    if (!college) return res.status(404).json({ error: 'Custom college not found (only schools you created can be deleted)' });
    db.prepare('DELETE FROM colleges WHERE id = ?').run(college.id);
    res.json({ ok: true });
  });

  // PATCH /api/colleges/:id/requirements/:reqId  { type?, title?, prompt_text?, word_limit?, optional?, topics? }
  r.patch('/:id/requirements/:reqId', (req, res) => {
    const existing = ownRequirement(req);
    if (!existing) return res.status(404).json({ error: 'Custom requirement not found (only prompts you added can be edited)' });
    const body = req.body || {};
    const type = body.type ?? existing.type;
    if (!REQUIREMENT_TYPES.includes(type)) return res.status(400).json({ error: `type must be one of ${REQUIREMENT_TYPES.join(', ')}` });
    if (body.title !== undefined && !String(body.title).trim()) return res.status(400).json({ error: 'title cannot be empty' });
    const promptChanged =
      (body.prompt_text !== undefined && body.prompt_text !== existing.prompt_text) || Array.isArray(body.topics) || type !== existing.type;

    db.transaction(() => {
      db.prepare('UPDATE requirements SET type = ?, title = ?, prompt_text = ?, word_limit = ?, optional = ? WHERE id = ?').run(
        type,
        body.title !== undefined ? String(body.title).trim() : existing.title,
        body.prompt_text !== undefined ? body.prompt_text || null : existing.prompt_text,
        body.word_limit !== undefined ? Number(body.word_limit) || null : existing.word_limit,
        body.optional !== undefined ? (body.optional ? 1 : 0) : existing.optional,
        existing.id,
      );
      if (Array.isArray(body.topics)) {
        db.prepare('DELETE FROM requirement_topics WHERE requirement_id = ?').run(existing.id);
        const addTopic = db.prepare('INSERT INTO requirement_topics (requirement_id, topic) VALUES (?, ?)');
        for (const t of cleanTopics(body.topics)) addTopic.run(existing.id, t);
      }
      if (promptChanged) {
        // The old reuse suggestion was scored against the old wording; recompute.
        db.prepare(
          `UPDATE user_requirement_status SET status = 'not_started', reuse_essay_id = NULL, reuse_score = NULL, reuse_reason = NULL
            WHERE user_id = ? AND requirement_id = ? AND status = 'reusable'`,
        ).run(req.user.id, existing.id);
        if (type !== 'essay') db.prepare('DELETE FROM essay_assignments WHERE requirement_id = ?').run(existing.id);
      }
    })();
    if (promptChanged) rerunAllReuse(db, req.user.id);
    res.json({ requirement: withTopics(db, [db.prepare('SELECT * FROM requirements WHERE id = ?').get(existing.id)])[0] });
  });

  r.delete('/:id/requirements/:reqId', (req, res) => {
    const existing = ownRequirement(req);
    if (!existing) return res.status(404).json({ error: 'Custom requirement not found (only prompts you added can be deleted)' });
    db.prepare('DELETE FROM requirements WHERE id = ?').run(existing.id);
    res.json({ ok: true });
  });

  return r;
}
