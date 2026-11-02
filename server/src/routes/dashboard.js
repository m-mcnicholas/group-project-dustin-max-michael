import { Router } from 'express';
import { myColleges } from '../services.js';

export function dashboardRouter(db) {
  const r = Router();

  // GET /api/dashboard?tag=<tagId>
  r.get('/', (req, res) => {
    let colleges = myColleges(db, req.user.id);
    const tagId = Number(req.query.tag);
    if (tagId) colleges = colleges.filter((c) => c.tags.some((t) => t.id === tagId));

    const today = new Date().toISOString().slice(0, 10);
    const deadlines = colleges
      .filter((c) => c.next_deadline)
      .map((c) => ({ college_id: c.id, college_name: c.name, round: c.round, date: c.next_deadline, past: c.next_deadline < today }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const essayTitles = new Map(db.prepare('SELECT id, title FROM essays WHERE user_id = ?').all(req.user.id).map((e) => [e.id, e.title]));
    const reuseAlerts = colleges.flatMap((c) =>
      c.requirements
        .filter((r) => r.status === 'reusable')
        .map((r) => ({
          requirement_id: r.id,
          requirement_title: r.title,
          college_id: c.id,
          college_name: c.name,
          essay_id: r.reuse.essay_id,
          essay_title: essayTitles.get(r.reuse.essay_id),
          score: r.reuse.score,
          reason: r.reuse.reason,
        })),
    );

    // Requirements are bulky; the dashboard cards only need the summary.
    const cards = colleges.map(({ requirements, ...c }) => c);
    res.json({ colleges: cards, deadlines, reuseAlerts });
  });

  return r;
}
