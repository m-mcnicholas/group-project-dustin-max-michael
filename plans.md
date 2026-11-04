# College Applications Tracker — Plan

## Context
Group project (Dustin, Max, Michael). The repo is empty except for a README. The goal is a web app where students track college applications: which schools they're applying to, what each school requires (essays, recs, transcripts, test scores, and so on), and how far along each piece is. The standout feature is **essay reuse detection**: when an essay is marked complete, other schools' prompts on the same topic get flagged as "similar essay can be reused."

Decisions so far:
- **Stack:** React (Vite) frontend + Node/Express backend, plain JavaScript
- **Users:** each student has an account, plus **user-defined tags** on schools ("reach", "safety", "dream", anything)
- **Reuse detection:** topic tags on prompts **plus** prompt-wording similarity (TF-IDF cosine)
- **College data:** hand-curated seed list (about 25–40 major schools), plus users can add custom schools and prompts

## Architecture
```
/client   React + Vite + React Router; fetch() to /api
/server   Express + SQLite (better-sqlite3) ; bcrypt + JWT (httpOnly cookie)
/server/seed/colleges.json   curated schools + requirements + prompt tags
```
I picked SQLite because it needs no DB server, the data is one file, and it's easy for three people to run locally. The Vite dev server proxies `/api` to Express.

## Data model
| Table | Key fields |
|---|---|
| `users` | id, email, password_hash, name |
| `colleges` | id, name, location, platform (Common App / Coalition / UC / own), deadlines (ED/EA/RD), `created_by` (null = curated) |
| `requirements` | id, college_id, type (`essay`/`rec`/`transcript`/`test_scores`/`portfolio`/`interview`/`fee`), title, prompt_text, word_limit, optional flag, `shared_key` (e.g. `common_app_personal`, so one essay covers all Common App schools) |
| `requirement_topics` | requirement_id, topic (fixed vocab: `community_service`, `challenge`, `identity`, `why_us`, `why_major`, `leadership`, `intellectual_curiosity`, `activity`, `diversity`, `growth`, ...) |
| `user_colleges` | user_id, college_id, round (ED/EA/RD), app_status |
| `user_tags` / `user_college_tags` | user-defined tag name + color; many-to-many with user_colleges |
| `essays` | id, user_id, title, content, word_count, status (`not_started`/`drafting`/`complete`) |
| `essay_assignments` | essay_id, requirement_id (one essay can satisfy many prompts) |
| `user_requirement_status` | user_id, requirement_id, status, `reuse_essay_id`, `reuse_score`, `reuse_reason` |

## Essay reuse engine (`server/src/reuse.js`)
- `similarity(reqA, reqB)` = 0.6 × tag Jaccard overlap + 0.4 × TF-IDF cosine of prompt text (hand-rolled tokenizer with a stopword list; no external NLP lib needed)
- **Trigger:** when an essay's status changes to `complete`, for every requirement it's assigned to, scan the user's *other* incomplete essay requirements. If the score is ≥ threshold (start at 0.35, then tune), set status to `reusable` with `reuse_essay_id`, the score, and a human-readable reason ("Shares topic: community service · prompt wording 58% similar").
- **Word-limit check:** if the finished essay exceeds the target prompt's limit, still suggest it but add "needs trimming: 650 → 250 words."
- The user can **accept** (assign the essay to that prompt) or **dismiss** the suggestion.
- The engine is pure functions that are easy to unit test.

## API (Express, all under `/api`, auth required except auth routes)
- `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET /colleges?search=`, `GET /colleges/:id` (with requirements), `POST /colleges` (custom), `POST /colleges/:id/requirements` (custom prompt)
- `GET/POST/PATCH/DELETE /my/colleges` (add to list, set round and tags)
- `GET/POST/PATCH/DELETE /tags`
- `GET/POST/PATCH/DELETE /essays`, `POST /essays/:id/assign`, `PATCH /essays/:id` (status change runs the reuse engine)
- `PATCH /my/requirements/:id` (mark rec/transcript done, accept or dismiss a reuse suggestion)
- `GET /dashboard` (progress per school, upcoming deadlines, reuse alerts)

## Frontend pages
1. **Login / Signup**
2. **Dashboard:** my schools as cards (progress bar, round, tag chips, next deadline), "Reuse opportunities" panel, deadlines timeline
3. **College browser:** search the curated plus custom list, "Add to my list," "Add custom school"
4. **College detail:** requirement checklist; essay prompts show status badges (`Not started` / `Drafting` / `Complete` / `♻ Similar essay can be reused`)
5. **Essays:** list and simple editor with a live word count, assign to prompts, mark complete
6. **Tags:** create, rename, and color tags; filter the dashboard by tag (e.g. show only "reach")

## Seed data
`server/seed/colleges.json`, about 25–40 schools (Ivies, Stanford, MIT, UCs, large state schools, and so on). Requirements and supplemental prompts are entered from each school's official 2026–27 page, with topic tags added by hand. Each school stores a `source_url` and `last_verified` date, and the UI notes that users should double-check official sites. `npm run seed` loads it into SQLite.

## Suggested team split
- **Data and engine:** schema, seed JSON, reuse engine and its tests
- **Backend:** Express routes, auth, wiring the engine into essay status changes
- **Frontend:** React pages, components, styling

## Milestones
1. Scaffold `client/` and `server/`, schema, seed loader, `plans.md`
2. Auth and the college browser/detail (read-only)
3. My list, user tags, requirement checklist
4. Essays, assignment, and the reuse engine with suggestions
5. Dashboard, deadline view, polish

## Remaining work (after the proof-of-concept skeleton)
The skeleton covers every page and route above end to end. Still to do:
- [x] **Real seed data** (Data and engine): 35 real schools from official 2026–27 pages (verified 2026-11-04; per-school `notes` flag anything unconfirmed). Threshold tuned from `0.35` to `0.40` with `seed/tune-threshold.js`, plus light stemming in the tokenizer
- [x] **Edit/delete custom schools and prompts** (Backend + Frontend): creator-only `PATCH`/`DELETE` on `/colleges/:id` and `/colleges/:id/requirements/:reqId`
- [x] **Application status UI** (submitted / accepted / etc.) (Frontend): picker on the school page, badges on the dashboard and timeline
- [x] **Autosave in the essay editor** (Frontend): saves 1.2s after you stop typing and when you leave or close the page; Cmd/Ctrl+S saves too
- [x] **Nicer dashboard and a deadline timeline** (Frontend): stat tiles, tag filter chips, month-grouped timeline with a "today" marker and urgency colors
- [x] **Real styling** to replace the placeholder CSS (Frontend), with dark mode and mobile layout
- [x] **Production setup** (Backend): `JWT_SECRET` required in production, Express serves `client/dist`, root `npm run build` / `npm start`

Still open: re-verify the schools flagged in the seed `notes` (USC, UVA, UF, Michigan, NYU).

## Verification
- **Unit tests (Vitest)** for `reuse.js`: two community-service prompts score above the threshold; "why us" vs. "challenge" score below it; word-limit warning
- **API tests (supertest):** sign up, add two schools with community-service prompts, write an essay, assign it to school A, mark it complete, then check that school B's prompt reads `reusable` with the right essay id
- **Manual:** `npm run dev` in both folders, then click through the same flow in the browser and confirm the ♻ badge and the dashboard alert appear
