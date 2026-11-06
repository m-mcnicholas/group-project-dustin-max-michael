import { Router } from 'express';
import { myColleges, rerunAllReuse, setRequirementStatus } from '../services.js';

const ROUNDS = ['ED', 'EA', 'RD'];
const APP_STATUSES = ['planning', 'in_progress', 'submitted', 'accepted', 'rejected', 'waitlisted'];
const MANUAL_STATUSES = ['not_started', 'in_progress', 'complete'];

export function myRouter(db) {
  const r = Router();

  // ---- /api/my/colleges ----------------------------------------------------
  r.get('/colleges', (req, res) => res.json({ colleges: myColleges(db, req.user.id) }));

  r.post('/colleges', (req, res) => {
    const { college_id, round = 'RD' } = req.body || {};
    if (!ROUNDS.includes(round)) return res.status(400).json({ error: 'round must be ED, EA or RD' });
    const college = db
      .prepare('SELECT id FROM colleges WHERE id = ? AND (created_by IS NULL OR created_by = ?)')
      .get(college_id, req.user.id);
    if (!college) return res.status(404).json({ error: 'College not found' });
    db.prepare('INSERT OR IGNORE INTO user_colleges (user_id, college_id, round) VALUES (?, ?, ?)').run(req.user.id, college.id, round);
    // Already-complete essays may now be reusable for this school's prompts.
    rerunAllReuse(db, req.user.id);
    res.status(201).json({ colleges: myColleges(db, req.user.id) });
  });

  // PATCH /api/my/colleges/:userCollegeId  { round?, app_status?, tag_ids? }
  r.patch('/colleges/:id', (req, res) => {
    const uc = db.prepare('SELECT * FROM user_colleges WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!uc) return res.status(404).json({ error: 'Not on your list' });
    const { round, app_status, tag_ids } = req.body || {};
    if (round !== undefined && !ROUNDS.includes(round)) return res.status(400).json({ error: 'bad round' });
    if (app_status !== undefined && !APP_STATUSES.includes(app_status)) return res.status(400).json({ error: 'bad app_status' });
    db.transaction(() => {
      if (round) db.prepare('UPDATE user_colleges SET round = ? WHERE id = ?').run(round, uc.id);
      if (app_status) db.prepare('UPDATE user_colleges SET app_status = ? WHERE id = ?').run(app_status, uc.id);
      if (Array.isArray(tag_ids)) {
        db.prepare('DELETE FROM user_college_tags WHERE user_college_id = ?').run(uc.id);
        const owned = db.prepare('SELECT 1 FROM user_tags WHERE id = ? AND user_id = ?');
        const add = db.prepare('INSERT OR IGNORE INTO user_college_tags (user_college_id, tag_id) VALUES (?, ?)');
        for (const t of tag_ids) if (owned.get(t, req.user.id)) add.run(uc.id, t);
      }
    })();
    res.json({ colleges: myColleges(db, req.user.id) });
  });

  r.delete('/colleges/:id', (req, res) => {
    db.prepare('DELETE FROM user_colleges WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ colleges: myColleges(db, req.user.id) });
  });

  // ---- /api/my/requirements/:requirementId ---------------------------------
  // Body: { status: 'not_started'|'in_progress'|'complete' }  (recs, transcripts, ...)
  //    or { action: 'accept' | 'dismiss' }                     (reuse suggestions)
  r.patch('/requirements/:id', (req, res) => {
    const reqId = Number(req.params.id);
    const userId = req.user.id;
    const { status, action } = req.body || {};
    const visible = db
      .prepare('SELECT 1 FROM requirements WHERE id = ? AND (created_by IS NULL OR created_by = ?)')
      .get(reqId, userId);
    if (!visible) return res.status(404).json({ error: 'Requirement not found' });
    const current = db.prepare('SELECT * FROM user_requirement_status WHERE user_id = ? AND requirement_id = ?').get(userId, reqId);

    if (action === 'accept' || action === 'dismiss') {
      if (current?.status !== 'reusable') return res.status(400).json({ error: 'No reuse suggestion on this requirement' });
      db.transaction(() => {
        if (action === 'accept') {
          db.prepare('INSERT OR IGNORE INTO essay_assignments (essay_id, requirement_id) VALUES (?, ?)').run(current.reuse_essay_id, reqId);
        } else {
          db.prepare('INSERT OR IGNORE INTO reuse_dismissals (user_id, requirement_id, essay_id) VALUES (?, ?, ?)').run(
            userId,
            reqId,
            current.reuse_essay_id,
          );
        }
        setRequirementStatus(db, userId, reqId, 'not_started');
      })();
      return res.json({ ok: true });
    }

    if (!MANUAL_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${MANUAL_STATUSES.join(', ')}` });
    setRequirementStatus(db, userId, reqId, status);
    res.json({ ok: true });
  });

  return r;
}
