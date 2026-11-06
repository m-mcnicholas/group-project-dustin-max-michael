import { Router } from 'express';
import { myColleges } from '../services.js';

const SUBMITTED = ['submitted', 'accepted', 'rejected', 'waitlisted'];
const DAY = 24 * 60 * 60 * 1000;
const daysBetween = (fromIso, toIso) => Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY);

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
      .map((c) => ({
        college_id: c.id,
        college_name: c.name,
        round: c.round,
        date: c.next_deadline,
        past: c.next_deadline < today,
        days_left: daysBetween(today, c.next_deadline),
        submitted: SUBMITTED.includes(c.app_status),
        app_status: c.app_status,
        percent: c.progress.percent,
      }))
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

    const essayReqs = colleges.flatMap((c) => c.requirements.filter((r) => r.type === 'essay' && !r.optional));
    const summary = {
      schools: colleges.length,
      submitted: colleges.filter((c) => SUBMITTED.includes(c.app_status)).length,
      accepted: colleges.filter((c) => c.app_status === 'accepted').length,
      essays_done: essayReqs.filter((r) => r.status === 'complete').length,
      essays_total: essayReqs.length,
      next_deadline: deadlines.find((d) => !d.past && !d.submitted) || null,
    };

    // Requirements are bulky; the dashboard cards only need the summary.
    const cards = colleges.map(({ requirements, ...c }) => c);
    res.json({ colleges: cards, deadlines, reuseAlerts, summary });
  });

  return r;
}
