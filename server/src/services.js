// DB-aware helpers shared by routes: requirement loading, effective statuses,
// and wiring the pure reuse engine (reuse.js) into essay status changes.
import { findReuseSuggestions, DEFAULT_THRESHOLD } from './reuse.js';

/** Attach `topics: string[]` to each requirement row. */
export function withTopics(db, reqs) {
  if (reqs.length === 0) return reqs;
  const ids = reqs.map((r) => r.id);
  const rows = db
    .prepare(`SELECT requirement_id, topic FROM requirement_topics WHERE requirement_id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids);
  const byReq = new Map();
  for (const { requirement_id, topic } of rows) {
    if (!byReq.has(requirement_id)) byReq.set(requirement_id, []);
    byReq.get(requirement_id).push(topic);
  }
  return reqs.map((r) => ({ ...r, optional: !!r.optional, topics: byReq.get(r.id) || [] }));
}

/** Colleges visible to a user: curated (created_by NULL) + their own custom ones. */
export const VISIBLE_COLLEGE = '(c.created_by IS NULL OR c.created_by = @userId)';

/**
 * Every requirement for the user's list of colleges, with its effective status:
 *   essays: complete > reusable > drafting > not_started  (derived from assigned essays)
 *   others: whatever the user set in user_requirement_status
 */
export function requirementsWithStatus(db, userId, collegeIds) {
  if (collegeIds.length === 0) return [];
  const reqs = withTopics(
    db,
    db
      .prepare(
        `SELECT * FROM requirements
          WHERE college_id IN (${collegeIds.map(() => '?').join(',')}) AND (created_by IS NULL OR created_by = ?)
          ORDER BY college_id, id`,
      )
      .all(...collegeIds, userId),
  );
  const urs = new Map(
    db.prepare('SELECT * FROM user_requirement_status WHERE user_id = ?').all(userId).map((r) => [r.requirement_id, r]),
  );
  const assigned = db
    .prepare(
      `SELECT ea.requirement_id, e.id, e.title, e.status, e.word_count
         FROM essay_assignments ea JOIN essays e ON e.id = ea.essay_id
        WHERE e.user_id = ?`,
    )
    .all(userId);
  const essaysByReq = new Map();
  for (const a of assigned) {
    if (!essaysByReq.has(a.requirement_id)) essaysByReq.set(a.requirement_id, []);
    essaysByReq.get(a.requirement_id).push({ id: a.id, title: a.title, status: a.status, word_count: a.word_count });
  }

  return reqs.map((r) => {
    const u = urs.get(r.id);
    const essays = essaysByReq.get(r.id) || [];
    let status = u?.status || 'not_started';
    if (r.type === 'essay') {
      if (essays.some((e) => e.status === 'complete')) status = 'complete';
      else if (u?.status === 'reusable') status = 'reusable';
      else if (essays.some((e) => e.status === 'drafting') || u?.status === 'in_progress') status = 'drafting';
      else status = 'not_started';
    }
    const reuse =
      status === 'reusable' ? { essay_id: u.reuse_essay_id, score: u.reuse_score, reason: u.reuse_reason } : null;
    return { ...r, status, essays, reuse };
  });
}

function myCollegeIds(db, userId) {
  return db.prepare('SELECT college_id FROM user_colleges WHERE user_id = ?').all(userId).map((r) => r.college_id);
}

const upsertStatus = (db) =>
  db.prepare(`
    INSERT INTO user_requirement_status (user_id, requirement_id, status, reuse_essay_id, reuse_score, reuse_reason)
    VALUES (@user_id, @requirement_id, @status, @reuse_essay_id, @reuse_score, @reuse_reason)
    ON CONFLICT (user_id, requirement_id) DO UPDATE SET
      status = excluded.status, reuse_essay_id = excluded.reuse_essay_id,
      reuse_score = excluded.reuse_score, reuse_reason = excluded.reuse_reason`);

export function setRequirementStatus(db, userId, requirementId, status, reuse = {}) {
  upsertStatus(db).run({
    user_id: userId,
    requirement_id: requirementId,
    status,
    reuse_essay_id: reuse.essay_id ?? null,
    reuse_score: reuse.score ?? null,
    reuse_reason: reuse.reason ?? null,
  });
}

/** Remove reuse suggestions that point at an essay (e.g. it went from complete back to drafting). */
export function clearSuggestionsFor(db, userId, essayId) {
  db.prepare(
    `UPDATE user_requirement_status
        SET status = 'not_started', reuse_essay_id = NULL, reuse_score = NULL, reuse_reason = NULL
      WHERE user_id = ? AND reuse_essay_id = ? AND status = 'reusable'`,
  ).run(userId, essayId);
}

/**
 * Run the reuse engine for a completed essay and persist suggestions.
 * Returns the suggestions that were written.
 */
export function runReuseEngine(db, userId, essayId, threshold = DEFAULT_THRESHOLD) {
  const essay = db.prepare('SELECT * FROM essays WHERE id = ? AND user_id = ?').get(essayId, userId);
  if (!essay || essay.status !== 'complete') return [];

  const sources = withTopics(
    db,
    db.prepare('SELECT r.* FROM requirements r JOIN essay_assignments ea ON ea.requirement_id = r.id WHERE ea.essay_id = ?').all(essayId),
  );
  if (sources.length === 0) return [];

  const dismissed = new Set(
    db.prepare('SELECT requirement_id FROM reuse_dismissals WHERE user_id = ? AND essay_id = ?').all(userId, essayId).map((r) => r.requirement_id),
  );
  const all = requirementsWithStatus(db, userId, myCollegeIds(db, userId));
  const candidates = all.filter((r) => r.type === 'essay' && r.status !== 'complete' && !dismissed.has(r.id));
  const corpus = db
    .prepare("SELECT prompt_text FROM requirements WHERE type = 'essay' AND (created_by IS NULL OR created_by = ?)")
    .all(userId)
    .map((r) => r.prompt_text || '');

  const suggestions = findReuseSuggestions({ essay, sources, candidates, corpus, threshold });
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const written = [];
  for (const s of suggestions) {
    if (s.sameSharedKey) {
      // Same shared prompt (e.g. Common App personal essay): one essay covers it, so just assign it.
      db.prepare('INSERT OR IGNORE INTO essay_assignments (essay_id, requirement_id) VALUES (?, ?)').run(essayId, s.requirement_id);
      setRequirementStatus(db, userId, s.requirement_id, 'not_started');
      written.push({ ...s, autoAssigned: true });
      continue;
    }
    const existing = byId.get(s.requirement_id)?.reuse;
    if (existing && existing.essay_id !== essayId && existing.score >= s.score) continue; // keep the better match
    setRequirementStatus(db, userId, s.requirement_id, 'reusable', s);
    written.push(s);
  }
  return written;
}

/** Progress summary for one college's requirements (optional ones excluded). */
export function progressOf(reqs) {
  const required = reqs.filter((r) => !r.optional);
  const done = required.filter((r) => r.status === 'complete').length;
  return { done, total: required.length, percent: required.length ? Math.round((100 * done) / required.length) : 0 };
}

/**
 * The user's list: each entry has college info, round, tags, progress, next deadline,
 * and its requirements with effective statuses.
 */
export function myColleges(db, userId) {
  const rows = db
    .prepare(
      `SELECT uc.id AS user_college_id, uc.round, uc.app_status, c.*
         FROM user_colleges uc JOIN colleges c ON c.id = uc.college_id
        WHERE uc.user_id = ? ORDER BY c.name`,
    )
    .all(userId);
  if (rows.length === 0) return [];
  const tagRows = db
    .prepare(
      `SELECT uct.user_college_id, t.id, t.name, t.color
         FROM user_college_tags uct JOIN user_tags t ON t.id = uct.tag_id
        WHERE t.user_id = ? ORDER BY t.name`,
    )
    .all(userId);
  const reqs = requirementsWithStatus(db, userId, rows.map((r) => r.id));
  return rows.map((c) => {
    const collegeReqs = reqs.filter((r) => r.college_id === c.id);
    return {
      ...c,
      tags: tagRows.filter((t) => t.user_college_id === c.user_college_id).map(({ id, name, color }) => ({ id, name, color })),
      next_deadline: deadlineFor(c, c.round),
      progress: progressOf(collegeReqs),
      requirements: collegeReqs,
    };
  });
}

export function deadlineFor(college, round) {
  return { ED: college.deadline_ed, EA: college.deadline_ea, RD: college.deadline_rd }[round] || college.deadline_rd || null;
}
