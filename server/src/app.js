import express from 'express';
import cookieParser from 'cookie-parser';
import { authRouter, requireAuth } from './auth.js';
import { collegesRouter } from './routes/colleges.js';
import { myRouter } from './routes/my.js';
import { tagsRouter } from './routes/tags.js';
import { essaysRouter } from './routes/essays.js';
import { dashboardRouter } from './routes/dashboard.js';

/** Build the Express app around a db handle (exported separately from listen() so tests can use supertest). */
export function createApp(db) {
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
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.expose ? err.message : 'Server error' });
  });
  return app;
}
