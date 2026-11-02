import { Router } from 'express';
import { VISIBLE_COLLEGE, requirementsWithStatus, withTopics } from '../services.js';
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

  return r;
}
