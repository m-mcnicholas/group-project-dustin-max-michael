import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const COOKIE = 'token';
const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set when NODE_ENV=production (e.g. `openssl rand -hex 32`).');
}
const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  // Secure cookies need HTTPS. Set COOKIE_SECURE=false to try a production build over plain http://localhost.
  secure: isProd && process.env.COOKIE_SECURE !== 'false',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });

/** Middleware: requires a valid JWT cookie, sets req.user = { id, email, name }. */
export function requireAuth(req, res, next) {
  try {
    req.user = jwt.verify(req.cookies?.[COOKIE], SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Not signed in' });
  }
}

export function authRouter(db) {
  const r = Router();

  function signIn(res, user) {
    res.cookie(COOKIE, jwt.sign(publicUser(user), SECRET, { expiresIn: '7d' }), cookieOpts);
    res.json({ user: publicUser(user) });
  }

  r.post('/signup', (req, res) => {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name) return res.status(400).json({ error: 'email, password and name are required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const normalized = String(email).trim().toLowerCase();
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(normalized)) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    const hash = bcrypt.hashSync(password, 10);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
      .run(normalized, hash, String(name).trim());
    signIn(res, db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid));
  });

  r.post('/login', (req, res) => {
    const { email, password } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
    if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
      return res.status(401).json({ error: 'Wrong email or password' });
    }
    signIn(res, user);
  });

  r.post('/logout', (req, res) => {
    res.clearCookie(COOKIE, { ...cookieOpts, maxAge: undefined });
    res.json({ ok: true });
  });

  r.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

  return r;
}
