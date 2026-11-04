import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter, requireAuth } from './auth.js';
import { collegesRouter } from './routes/colleges.js';
import { myRouter } from './routes/my.js';
import { tagsRouter } from './routes/tags.js';
import { essaysRouter } from './routes/essays.js';
import { dashboardRouter } from './routes/dashboard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLIENT_DIST = path.join(here, '..', '..', 'client', 'dist');

/** Build the Express app around a db handle (exported separately from listen() so tests can use supertest). */
export function createApp(db, { clientDist = process.env.CLIENT_DIST || DEFAULT_CLIENT_DIST } = {}) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.get('/health', (req, res) => res.json({ ok: true }));
  api.use('/auth', authRouter(db));
  api.use(requireAuth); // everything below needs a signed-in user
  api.use('/colleges', collegesRouter(db));
  api.use('/my', myRouter(db));
  api.use('/tags', tagsRouter(db));
  api.use('/essays', essaysRouter(db));
  api.use('/dashboard', dashboardRouter(db));
  app.use('/api', api);

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // Production: serve the built React app (`npm run build` in client/) from the same origin,
  // with an SPA fallback so deep links like /colleges/3 load index.html.
  if (clientDist && fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile('index.html', { root: clientDist }));
  }
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.expose ? err.message : 'Server error' });
  });
  return app;
}
