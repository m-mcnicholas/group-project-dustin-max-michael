-- College Applications Tracker schema (SQLite).
-- Run automatically by src/db.js on startup; every statement is idempotent.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS colleges (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  location      TEXT,
  platform      TEXT,               -- 'Common App' | 'Coalition' | 'UC' | 'own'
  deadline_ed   TEXT,               -- ISO date (YYYY-MM-DD) or NULL
  deadline_ea   TEXT,
  deadline_rd   TEXT,
  source_url    TEXT,
  last_verified TEXT,
  created_by    INTEGER REFERENCES users(id) ON DELETE CASCADE  -- NULL = curated seed school
);

CREATE TABLE IF NOT EXISTS requirements (
  id          INTEGER PRIMARY KEY,
  college_id  INTEGER NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('essay','rec','transcript','test_scores','portfolio','interview','fee')),
  title       TEXT NOT NULL,
  prompt_text TEXT,
  word_limit  INTEGER,
  optional    INTEGER NOT NULL DEFAULT 0,
  shared_key  TEXT,                 -- e.g. 'common_app_personal': one essay covers every school with this key
  created_by  INTEGER REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS requirement_topics (
  requirement_id INTEGER NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  topic          TEXT NOT NULL,
  PRIMARY KEY (requirement_id, topic)
);

CREATE TABLE IF NOT EXISTS user_colleges (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  college_id INTEGER NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  round      TEXT NOT NULL DEFAULT 'RD' CHECK (round IN ('ED','EA','RD')),
  app_status TEXT NOT NULL DEFAULT 'planning',  -- planning | in_progress | submitted | accepted | rejected | waitlisted
  UNIQUE (user_id, college_id)
);

CREATE TABLE IF NOT EXISTS user_tags (
  id      INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  color   TEXT NOT NULL DEFAULT '#6b7280',
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS user_college_tags (
  user_college_id INTEGER NOT NULL REFERENCES user_colleges(id) ON DELETE CASCADE,
  tag_id          INTEGER NOT NULL REFERENCES user_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (user_college_id, tag_id)
);

CREATE TABLE IF NOT EXISTS essays (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','drafting','complete')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS essay_assignments (
  essay_id       INTEGER NOT NULL REFERENCES essays(id) ON DELETE CASCADE,
  requirement_id INTEGER NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  PRIMARY KEY (essay_id, requirement_id)
);

-- Per-user progress on a requirement. For essays with an assigned essay, the
-- effective status comes from the essay itself (see src/status.js).
CREATE TABLE IF NOT EXISTS user_requirement_status (
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requirement_id INTEGER NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','complete','reusable')),
  reuse_essay_id INTEGER REFERENCES essays(id) ON DELETE SET NULL,
  reuse_score    REAL,
  reuse_reason   TEXT,
  PRIMARY KEY (user_id, requirement_id)
);

-- Remembers dismissed suggestions so the engine doesn't re-suggest the same essay.
-- (Not in the original plan; added so "dismiss" sticks.)
CREATE TABLE IF NOT EXISTS reuse_dismissals (
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requirement_id INTEGER NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  essay_id       INTEGER NOT NULL REFERENCES essays(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, requirement_id, essay_id)
);
