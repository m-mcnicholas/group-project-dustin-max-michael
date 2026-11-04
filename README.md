# group-project-dustin-max-michael

College Applications Tracker: track schools, requirements, and essays, with **essay reuse detection**. See [`plans.md`](plans.md) for the full plan.

This is the **proof-of-concept skeleton**. Every page and API route in the plan exists and works end to end, but styling is minimal and the seed data is placeholder.

## Run it

You need Node 20+.

```bash
# terminal 1: API on :3001
cd server
npm install
npm run seed        # loads seed/colleges.json into server/data/app.db
npm run dev

# terminal 2: React app on :5173 (proxies /api to :3001)
cd client
npm install
npm run dev
```

Open http://localhost:5173, sign up, add **Northfield** and **Bayview** from *Colleges*, start Northfield's "Community Supplement" essay, write something, and click **Mark complete**. Bayview's "Service Reflection" now shows **♻ Similar essay can be reused**, and the dashboard lists it under *Reuse opportunities*.

Tests: `cd server && npm test` (Vitest unit tests for the engine plus a supertest API flow).

## Where things live

| Path | What it is | Owner (from plan) |
|---|---|---|
| `server/src/schema.sql` | All tables (applied automatically on startup) | Data & engine |
| `server/src/reuse.js` | Pure reuse engine: tokenizer, TF-IDF, Jaccard, `findReuseSuggestions` | Data & engine |
| `server/src/topics.js` | Fixed topic vocabulary + requirement types | Data & engine |
| `server/seed/colleges.json`, `seed.js` | Seed data + loader (re-runnable; updates by name) | Data & engine |
| `server/src/services.js` | Effective requirement status, wiring the engine to the DB, dashboard summaries | Backend |
| `server/src/auth.js` | Signup/login/logout/me, bcrypt + JWT in an httpOnly cookie | Backend |
| `server/src/routes/*.js` | `colleges`, `my` (list + requirement status), `tags`, `essays`, `dashboard` | Backend |
| `server/test/` | `reuse.test.js` (engine), `api.test.js` (full reuse flow) | Data & engine / Backend |
| `client/src/api.js` | Every API call in one place | Frontend |
| `client/src/pages/` | Auth, Dashboard, Colleges, CollegeDetail, Essays, EssayEditor, Tags | Frontend |
| `client/src/styles.css` | Placeholder styling | Frontend |

## How the reuse engine behaves

- Score = `0.6 × topic-tag Jaccard + 0.4 × TF-IDF cosine of prompt wording`. Threshold `0.35` (`DEFAULT_THRESHOLD` in `reuse.js`).
- Runs when an essay is marked **complete**, when a complete essay is assigned to another prompt, and when a school is added to your list.
- Prompts with the same `shared_key` (e.g. `common_app_personal`) are **auto-assigned**, with no suggestion step.
- Reopening a complete essay clears the suggestions it caused. Dismissed suggestions are remembered (`reuse_dismissals` table).
- If the essay is over the target's word limit, the reason says `needs trimming: 650 → 250 words`.

## Differences from `plans.md` (worth a look)

- **Seed schools are fictional** (Northfield University, Bayview College, …), so nobody mistakes sample prompts for real ones. Replace them with the real 25–40 schools from official 2026–27 pages.
- **`bcryptjs`** instead of `bcrypt`: same API, pure JavaScript, so no native build step on anyone's laptop.
- Added a **`reuse_dismissals`** table so "dismiss" sticks across engine re-runs.
- Added topics `personal_statement`, `creativity`, `family`, `future_goals` to the vocabulary.
- Requirement status for essays is **derived** from assigned essays (`complete > reusable > drafting > not_started`). Non-essay items (recs, transcripts…) use a manual dropdown.

## Next steps (by milestone)

- Real seed data (Data & engine), then tune the threshold against it.
- Edit/delete custom schools and prompts; app-status (submitted/accepted) UI.
- Autosave in the essay editor; nicer dashboard and deadline timeline; real styling.
- Production: set `JWT_SECRET`, serve `client/dist` from Express.
