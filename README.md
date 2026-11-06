# group-project-dustin-max-michael

College Applications Tracker: track schools, requirements, and essays, with **essay reuse detection**. See [`plans.md`](plans.md) for the full plan.

Every page and API route in the plan works end to end. The seed data is **35 real schools** with their 2026–27 requirements and prompts.

## Run it

You need Node 20+.

```bash
# From the repository root: install, seed, and start both servers
npm start
```

Open http://localhost:5173. Press Ctrl+C to stop both servers. On later runs,
`npm run dev` starts them without installing or seeding again.

Open http://localhost:5173, sign up, and add **Princeton** and **Brown** from *Colleges*. Then start Princeton's "More About You: What brings you joy" essay, write something (it autosaves), and click **Mark complete**. Brown's "Something that brings you joy" now shows **♻ Similar essay can be reused**, and the dashboard lists it under *Reuse opportunities*.

Tests: `cd server && npm test` runs 27 tests: Vitest unit tests for the engine, plus supertest API tests for the reuse flow, custom-school edit/delete, app status, production static serving, and the real seed file.

## Production

```bash
npm run install:all          # from the repo root
npm run build                # builds client/dist
npm run seed
JWT_SECRET=$(openssl rand -hex 32) npm run start:prod   # Express serves the API *and* client/dist on :3001
```

- With `NODE_ENV=production`, the server **refuses to start without `JWT_SECRET`**. Auth cookies are `Secure` there, so serve it over HTTPS. To try it over plain `http://localhost`, add `COOKIE_SECURE=false`.
- Express serves `client/dist` with an SPA fallback, so deep links like `/colleges/12` work. Unknown `/api/*` paths still get JSON errors.
- See `server/.env.example` for every setting (`PORT`, `DB_PATH`, `CLIENT_DIST`, …).

## Where things live

| Path | What it is | Owner (from plan) |
|---|---|---|
| `server/src/schema.sql` | All tables (applied automatically on startup) | Data & engine |
| `server/src/reuse.js` | Pure reuse engine: tokenizer, TF-IDF, Jaccard, `findReuseSuggestions` | Data & engine |
| `server/src/topics.js` | Fixed topic vocabulary + requirement types | Data & engine |
| `server/seed/colleges.json`, `seed.js` | Real 2026–27 seed data (35 schools) + loader (re-runnable; updates by name) | Data & engine |
| `server/seed/tune-threshold.js` | Scores every cross-school prompt pair to help tune the reuse threshold | Data & engine |
| `server/src/services.js` | Effective requirement status, wiring the engine to the DB, dashboard summaries | Backend |
| `server/src/auth.js` | Signup/login/logout/me, bcrypt + JWT in an httpOnly cookie | Backend |
| `server/src/routes/*.js` | `colleges`, `my` (list + requirement status), `tags`, `essays`, `dashboard` | Backend |
| `server/test/` | `reuse.test.js` (engine), `api.test.js` (reuse flow on `fixtures/colleges.json`, the old fictional schools), `custom.test.js`, `seed.test.js` | Data & engine / Backend |
| `client/src/api.js` | Every API call in one place | Frontend |
| `client/src/pages/` | Auth, Dashboard, Colleges, CollegeDetail, Essays, EssayEditor, Tags | Frontend |
| `client/src/styles.css` | All styling: color tokens on `:root`, dark mode via `prefers-color-scheme`, responsive down to phone width | Frontend |

## How the reuse engine behaves

- Score = `0.6 × topic-tag Jaccard + 0.4 × TF-IDF cosine of prompt wording`. Threshold `0.40` (`DEFAULT_THRESHOLD` in `reuse.js`), tuned against the real seed data with `node seed/tune-threshold.js`. At 0.35 most of the extra matches were noise: pairs sharing half their tags and only ~13% of their wording. The tokenizer does light stemming, so "served", "serving" and "serves" all match.
- Runs when an essay is marked **complete**, when a complete essay is assigned to another prompt, when a school is added to your list, and when you edit a custom prompt's wording or topics.
- Prompts with the same `shared_key` (e.g. `common_app_personal`) are **auto-assigned**, with no suggestion step.
- Reopening a complete essay clears the suggestions it caused. Dismissed suggestions are remembered (`reuse_dismissals` table).
- If the essay is over the target's word limit, the reason says `needs trimming: 650 → 250 words`.

## Differences from `plans.md` (worth a look)

- **Seed data was researched from official admissions pages on 2026-11-04.** Each school has a `notes` field listing anything that couldn't be confirmed. The weakest entries are USC (only one prompt verified), UVA (its site blocked automated access), UF (supplement prompts aren't published), and Michigan/NYU (some prompt text came from third-party quotes). **Re-verify before trusting a prompt.**
- **UC Personal Insight Questions** are 8 optional essays with shared keys `uc_piq_1`…`uc_piq_8`. You answer 4, and one essay covers the same question at every UC campus.
- **Curated schools are read-only.** You can edit or delete only schools and prompts you created.
- **`bcryptjs`** instead of `bcrypt`: same API, pure JavaScript, so no native build step on anyone's laptop.
- Added a **`reuse_dismissals`** table so "dismiss" sticks across engine re-runs.
- Added topics `personal_statement`, `creativity`, `family`, `future_goals` to the vocabulary.
- Requirement status for essays is **derived** from assigned essays (`complete > reusable > drafting > not_started`). Non-essay items (recs, transcripts…) use a manual dropdown.

## Next steps

- Re-verify the schools flagged in their `notes` (USC, UVA, UF, Michigan, NYU) and fill in UF's supplement once it's published.
- Ideas: deadline reminders by email, essay version history, sharing a read-only view with a counselor.
