import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seed } from '../seed/seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(here, '..', 'seed', 'colleges.json'), 'utf8'));

describe('real seed data (seed/colleges.json)', () => {
  let db;
  let agent;

  beforeAll(async () => {
    db = openDb(':memory:');
    seed(db, data); // throws on unknown types/topics
    agent = request.agent(createApp(db, { clientDist: null }));
    await agent.post('/api/auth/signup').send({ email: 'uc@example.com', password: 'password123', name: 'UC' }).expect(200);
  });

  it('has 25–40 schools, each with a source and verification date', () => {
    expect(data.colleges.length).toBeGreaterThanOrEqual(25);
    expect(data.colleges.length).toBeLessThanOrEqual(40);
    for (const c of data.colleges) {
      expect(c.source_url, c.name).toMatch(/^https:\/\//);
      expect(c.last_verified, c.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.deadline_ed || c.deadline_ea || c.deadline_rd, c.name).toBeTruthy();
    }
  });

  it('re-seeding is idempotent', () => {
    const count = () => db.prepare('SELECT COUNT(*) AS n FROM requirements').get().n;
    const before = count();
    seed(db, data);
    expect(count()).toBe(before);
  });

  it('one UC Personal Insight essay covers the same question at every UC campus', async () => {
    const ucs = (await agent.get('/api/colleges').query({ search: 'University of California' })).body.colleges;
    expect(ucs.length).toBeGreaterThanOrEqual(3);
    for (const c of ucs) await agent.post('/api/my/colleges').send({ college_id: c.id }).expect(201);
    const piq = (await agent.get(`/api/colleges/${ucs[0].id}`)).body.requirements.find((r) => r.shared_key === 'uc_piq_1');
    const { essay } = (await agent.post('/api/essays').send({ title: 'PIQ 1', content: 'Leadership story.', requirement_id: piq.id })).body;
    await agent.patch(`/api/essays/${essay.id}`).send({ status: 'complete' }).expect(200);
    for (const c of ucs) {
      const r = (await agent.get(`/api/colleges/${c.id}`)).body.requirements.find((x) => x.shared_key === 'uc_piq_1');
      expect(r.status, c.name).toBe('complete');
    }
  });
});
