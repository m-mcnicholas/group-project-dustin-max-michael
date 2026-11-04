// Load seed/colleges.json into SQLite: `npm run seed`
// Safe to re-run: curated schools are matched by name and updated in place, so users'
// lists and essays survive. Curated requirements missing from the JSON are removed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { REQUIREMENT_TYPES, TOPICS } from '../src/topics.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function seed(db, data) {
  const findCollege = db.prepare('SELECT id FROM colleges WHERE name = ? AND created_by IS NULL');
  const insertCollege = db.prepare(`
    INSERT INTO colleges (name, location, platform, deadline_ed, deadline_ea, deadline_rd, source_url, last_verified)
    VALUES (@name, @location, @platform, @deadline_ed, @deadline_ea, @deadline_rd, @source_url, @last_verified)`);
  const updateCollege = db.prepare(`
    UPDATE colleges SET location=@location, platform=@platform, deadline_ed=@deadline_ed, deadline_ea=@deadline_ea,
      deadline_rd=@deadline_rd, source_url=@source_url, last_verified=@last_verified WHERE id=@id`);
  const findReq = db.prepare('SELECT id FROM requirements WHERE college_id = ? AND title = ? AND created_by IS NULL');
  const insertReq = db.prepare(`
    INSERT INTO requirements (college_id, type, title, prompt_text, word_limit, optional, shared_key)
    VALUES (@college_id, @type, @title, @prompt_text, @word_limit, @optional, @shared_key)`);
  const updateReq = db.prepare(`
    UPDATE requirements SET type=@type, prompt_text=@prompt_text, word_limit=@word_limit, optional=@optional,
      shared_key=@shared_key WHERE id=@id`);
  const clearTopics = db.prepare('DELETE FROM requirement_topics WHERE requirement_id = ?');
  const addTopic = db.prepare('INSERT INTO requirement_topics (requirement_id, topic) VALUES (?, ?)');

  let schools = 0;
  let reqs = 0;
  db.transaction(() => {
    for (const c of data.colleges) {
      const row = {
        name: c.name,
        location: c.location ?? null,
        platform: c.platform ?? null,
        deadline_ed: c.deadline_ed ?? null,
        deadline_ea: c.deadline_ea ?? null,
        deadline_rd: c.deadline_rd ?? null,
        source_url: c.source_url ?? null,
        last_verified: c.last_verified ?? null,
      };
      const existing = findCollege.get(c.name);
      const collegeId = existing ? (updateCollege.run({ ...row, id: existing.id }), existing.id) : insertCollege.run(row).lastInsertRowid;
      schools++;

      const keep = [];
      for (const r of c.requirements || []) {
        if (!REQUIREMENT_TYPES.includes(r.type)) throw new Error(`${c.name} / ${r.title}: unknown type "${r.type}"`);
        const bad = (r.topics || []).filter((t) => !TOPICS.includes(t));
        if (bad.length) throw new Error(`${c.name} / ${r.title}: unknown topic(s) ${bad.join(', ')} (see src/topics.js)`);
        const reqRow = {
          college_id: collegeId,
          type: r.type,
          title: r.title,
          prompt_text: r.prompt_text ?? null,
          word_limit: r.word_limit ?? null,
          optional: r.optional ? 1 : 0,
          shared_key: r.shared_key ?? null,
        };
        const found = findReq.get(collegeId, r.title);
        const reqId = found ? (updateReq.run({ ...reqRow, id: found.id }), found.id) : insertReq.run(reqRow).lastInsertRowid;
        clearTopics.run(reqId);
        for (const t of r.topics || []) addTopic.run(reqId, t);
        keep.push(reqId);
        reqs++;
      }
      db.prepare(
        `DELETE FROM requirements WHERE college_id = ? AND created_by IS NULL ${keep.length ? `AND id NOT IN (${keep.join(',')})` : ''}`,
      ).run(collegeId);
    }
  })();
  return { schools, reqs };
}

// Run directly: node seed/seed.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = JSON.parse(fs.readFileSync(path.join(here, 'colleges.json'), 'utf8'));
  const db = openDb();
  const { schools, reqs } = seed(db, data);
  console.log(`Seeded ${schools} schools and ${reqs} requirements.`);
}
