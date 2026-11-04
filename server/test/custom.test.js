import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

let db;
let alice;
let bob;

beforeAll(async () => {
  db = openDb(':memory:');
  const app = createApp(db, { clientDist: null });
  alice = request.agent(app);
  bob = request.agent(app);
  await alice.post('/api/auth/signup').send({ email: 'alice@example.com', password: 'password123', name: 'Alice' }).expect(200);
  await bob.post('/api/auth/signup').send({ email: 'bob@example.com', password: 'password123', name: 'Bob' }).expect(200);
});

describe('custom schools and prompts: edit and delete', () => {
  let college;
  let prompt;

  it('creates a custom school and prompt', async () => {
    college = (await alice.post('/api/colleges').send({ name: 'Lakeside State', deadline_rd: '2027-01-15' }).expect(201)).body.college;
    prompt = (
      await alice
        .post(`/api/colleges/${college.id}/requirements`)
        .send({ type: 'essay', title: 'Short answer', prompt_text: 'Why Lakeside?', word_limit: 150, topics: ['why_us'] })
        .expect(201)
    ).body.requirement;
  });

  it('edits the school', async () => {
    const res = await alice.patch(`/api/colleges/${college.id}`).send({ name: 'Lakeside State University', deadline_ea: '2026-11-15' }).expect(200);
    expect(res.body.college).toMatchObject({ name: 'Lakeside State University', deadline_ea: '2026-11-15', deadline_rd: '2027-01-15' });
    await alice.patch(`/api/colleges/${college.id}`).send({ name: '  ' }).expect(400);
  });

  it('edits the prompt, including topics', async () => {
    const res = await alice
      .patch(`/api/colleges/${college.id}/requirements/${prompt.id}`)
      .send({ title: 'Community essay', prompt_text: 'How have you served your community?', word_limit: 250, topics: ['community_service', 'bogus'] })
      .expect(200);
    expect(res.body.requirement).toMatchObject({ title: 'Community essay', word_limit: 250, topics: ['community_service'] });
  });

  it('re-scores reuse suggestions when a prompt changes', async () => {
    const other = (
      await alice
        .post(`/api/colleges/${college.id}/requirements`)
        .send({ type: 'essay', title: 'Leadership', prompt_text: 'Describe a time you led a team.', topics: ['leadership'] })
        .expect(201)
    ).body.requirement;
    await alice.post('/api/my/colleges').send({ college_id: college.id }).expect(201);
    const { essay } = (await alice.post('/api/essays').send({ title: 'Food bank', content: 'I volunteered.', requirement_id: prompt.id })).body;
    await alice.patch(`/api/essays/${essay.id}`).send({ status: 'complete' }).expect(200);
    const status = async () => (await alice.get(`/api/colleges/${college.id}`)).body.requirements.find((r) => r.id === other.id).status;
    expect(await status()).toBe('not_started');

    // Rewording the leadership prompt into a service prompt should now produce a suggestion...
    await alice
      .patch(`/api/colleges/${college.id}/requirements/${other.id}`)
      .send({ prompt_text: 'Tell us about serving your community.', topics: ['community_service'] })
      .expect(200);
    expect(await status()).toBe('reusable');

    // ...and rewording it back clears it.
    await alice
      .patch(`/api/colleges/${college.id}/requirements/${other.id}`)
      .send({ prompt_text: 'Describe a time you led a team.', topics: ['leadership'] })
      .expect(200);
    expect(await status()).toBe('not_started');
  });

  it("does not let other users edit or delete someone else's school or prompt", async () => {
    await bob.patch(`/api/colleges/${college.id}`).send({ name: 'Hacked' }).expect(404);
    await bob.delete(`/api/colleges/${college.id}`).expect(404);
    await bob.patch(`/api/colleges/${college.id}/requirements/${prompt.id}`).send({ title: 'x' }).expect(404);
    await bob.delete(`/api/colleges/${college.id}/requirements/${prompt.id}`).expect(404);
  });

  it('does not allow editing curated schools', async () => {
    const { lastInsertRowid } = db.prepare("INSERT INTO colleges (name) VALUES ('Curated U')").run();
    await alice.patch(`/api/colleges/${lastInsertRowid}`).send({ name: 'Mine now' }).expect(404);
    await alice.delete(`/api/colleges/${lastInsertRowid}`).expect(404);
  });

  it('deletes the prompt, then the school (removing it from the list)', async () => {
    await alice.delete(`/api/colleges/${college.id}/requirements/${prompt.id}`).expect(200);
    const reqs = (await alice.get(`/api/colleges/${college.id}`)).body.requirements;
    expect(reqs.some((r) => r.id === prompt.id)).toBe(false);

    await alice.delete(`/api/colleges/${college.id}`).expect(200);
    await alice.get(`/api/colleges/${college.id}`).expect(404);
    expect((await alice.get('/api/my/colleges')).body.colleges).toHaveLength(0);
    // The essay survives, just unassigned.
    const essays = (await alice.get('/api/essays')).body.essays;
    expect(essays[0].assignments).toHaveLength(0);
  });
});

describe('application status + dashboard summary', () => {
  it('updates app_status and reports it on the dashboard', async () => {
    const c = (await alice.post('/api/colleges').send({ name: 'Summit College', deadline_rd: '2099-01-01' }).expect(201)).body.college;
    await alice.post('/api/my/colleges').send({ college_id: c.id }).expect(201);
    const uc = (await alice.get('/api/my/colleges')).body.colleges.find((x) => x.id === c.id);
    await alice.patch(`/api/my/colleges/${uc.user_college_id}`).send({ app_status: 'nope' }).expect(400);
    await alice.patch(`/api/my/colleges/${uc.user_college_id}`).send({ app_status: 'submitted' }).expect(200);

    const dash = (await alice.get('/api/dashboard')).body;
    expect(dash.colleges.find((x) => x.id === c.id).app_status).toBe('submitted');
    expect(dash.summary).toMatchObject({ schools: 1, submitted: 1 });
    expect(dash.deadlines[0]).toMatchObject({ submitted: true, past: false });
    expect(dash.deadlines[0].days_left).toBeGreaterThan(0);
  });
});

describe('production static serving', () => {
  it('serves client/dist with an SPA fallback, but keeps /api 404s as JSON', async () => {
    // Put it under a dot-directory: sendFile rejects dotfile segments in absolute paths unless `root` is used.
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dist-')), '.hidden', 'dist');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>app</title>');
    fs.writeFileSync(path.join(dir, 'app.js'), 'console.log(1)');
    const app = createApp(openDb(':memory:'), { clientDist: dir });
    expect((await request(app).get('/').expect(200)).text).toContain('<title>app</title>');
    expect((await request(app).get('/colleges/12').expect(200)).text).toContain('<title>app</title>');
    expect((await request(app).get('/app.js').expect(200)).text).toContain('console.log');
    // Unknown API paths never fall through to index.html.
    const health = await request(app).get('/api/health').expect(200);
    expect(health.body).toEqual({ ok: true });
    const unknown = await request(app).get('/api/nope');
    expect(unknown.headers['content-type']).toMatch(/json/);
  });
});
