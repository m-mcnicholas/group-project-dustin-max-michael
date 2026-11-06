import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seed } from '../seed/seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedData = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'colleges.json'), 'utf8'));

let agent;
let db;
const byName = async (name) => (await agent.get('/api/colleges').query({ search: name })).body.colleges[0];

beforeAll(() => {
  db = openDb(':memory:');
  seed(db, seedData);
  agent = request.agent(createApp(db)); // agent keeps the auth cookie between requests
});

describe('auth', () => {
  it('rejects unauthenticated requests', async () => {
    await request(createApp(db)).get('/api/colleges').expect(401);
  });

  it('signs up and returns the user', async () => {
    const res = await agent.post('/api/auth/signup').send({ email: 'Test@Example.com', password: 'password123', name: 'Tess' }).expect(200);
    expect(res.body.user).toMatchObject({ email: 'test@example.com', name: 'Tess' });
    await agent.get('/api/auth/me').expect(200);
  });
});

describe('essay reuse flow', () => {
  it('marks school B’s community-service prompt reusable after finishing school A’s essay', async () => {
    const a = await byName('Northfield');
    const b = await byName('Bayview');
    await agent.post('/api/my/colleges').send({ college_id: a.id, round: 'ED' }).expect(201);
    await agent.post('/api/my/colleges').send({ college_id: b.id }).expect(201);

    const detailA = (await agent.get(`/api/colleges/${a.id}`)).body;
    const promptA = detailA.requirements.find((r) => r.topics.includes('community_service'));

    const { essay } = (await agent.post('/api/essays').send({ title: 'Food bank', content: 'I volunteered at the food bank '.repeat(10) })).body;
    await agent.post(`/api/essays/${essay.id}/assign`).send({ requirement_id: promptA.id }).expect(200);
    const done = await agent.patch(`/api/essays/${essay.id}`).send({ status: 'complete' }).expect(200);
    expect(done.body.suggestions.length).toBeGreaterThan(0);

    const detailB = (await agent.get(`/api/colleges/${b.id}`)).body;
    const promptB = detailB.requirements.find((r) => r.title === 'Service Reflection');
    expect(promptB.status).toBe('reusable');
    expect(promptB.reuse.essay_id).toBe(essay.id);

    const dash = (await agent.get('/api/dashboard')).body;
    expect(dash.reuseAlerts.some((x) => x.requirement_id === promptB.id && x.essay_id === essay.id)).toBe(true);

    // Accepting assigns the essay, so the prompt becomes complete.
    await agent.patch(`/api/my/requirements/${promptB.id}`).send({ action: 'accept' }).expect(200);
    const after = (await agent.get(`/api/colleges/${b.id}`)).body.requirements.find((r) => r.id === promptB.id);
    expect(after.status).toBe('complete');
  });

  it('auto-assigns the Common App essay to every school sharing it', async () => {
    const a = await byName('Northfield');
    const b = await byName('Bayview');
    const caA = (await agent.get(`/api/colleges/${a.id}`)).body.requirements.find((r) => r.shared_key === 'common_app_personal');
    const { essay } = (await agent.post('/api/essays').send({ title: 'Personal statement', requirement_id: caA.id })).body;
    await agent.patch(`/api/essays/${essay.id}`).send({ status: 'complete' }).expect(200);
    const caB = (await agent.get(`/api/colleges/${b.id}`)).body.requirements.find((r) => r.shared_key === 'common_app_personal');
    expect(caB.status).toBe('complete');
  });

  it('dismissed suggestions stay dismissed', async () => {
    const c = await byName('Harborview');
    await agent.post('/api/my/colleges').send({ college_id: c.id }).expect(201); // re-runs engine for complete essays
    const prompt = (await agent.get(`/api/colleges/${c.id}`)).body.requirements.find((r) => r.title === 'Your Community');
    expect(prompt.status).toBe('reusable');
    await agent.patch(`/api/my/requirements/${prompt.id}`).send({ action: 'dismiss' }).expect(200);
    const food = (await agent.get('/api/essays')).body.essays.find((e) => e.title === 'Food bank');
    await agent.patch(`/api/essays/${food.id}`).send({ status: 'complete' }).expect(200); // re-run
    const again = (await agent.get(`/api/colleges/${c.id}`)).body.requirements.find((r) => r.id === prompt.id);
    expect(again.status).toBe('not_started');
  });
});

describe('tags', () => {
  it('creates a tag, applies it, and filters the dashboard', async () => {
    const { tags } = (await agent.post('/api/tags').send({ name: 'reach', color: '#dc2626' }).expect(201)).body;
    const mine = (await agent.get('/api/my/colleges')).body.colleges;
    await agent.patch(`/api/my/colleges/${mine[0].user_college_id}`).send({ tag_ids: [tags[0].id] }).expect(200);
    const dash = (await agent.get('/api/dashboard').query({ tag: tags[0].id })).body;
    expect(dash.colleges).toHaveLength(1);
    expect(dash.colleges[0].tags[0].name).toBe('reach');
  });
});
