import { Router } from 'express';

const COLOR = /^#[0-9a-fA-F]{6}$/;

export function tagsRouter(db) {
  const r = Router();
  const list = (userId) => db.prepare('SELECT id, name, color FROM user_tags WHERE user_id = ? ORDER BY name').all(userId);

  r.get('/', (req, res) => res.json({ tags: list(req.user.id) }));

  r.post('/', (req, res) => {
    const { name, color = '#6b7280' } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!COLOR.test(color)) return res.status(400).json({ error: 'color must look like #a1b2c3' });
    try {
      db.prepare('INSERT INTO user_tags (user_id, name, color) VALUES (?, ?, ?)').run(req.user.id, name.trim(), color);
    } catch (e) {
      if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'You already have a tag with that name' });
      throw e;
    }
    res.status(201).json({ tags: list(req.user.id) });
  });

  r.patch('/:id', (req, res) => {
    const tag = db.prepare('SELECT * FROM user_tags WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!tag) return res.status(404).json({ error: 'Tag not found' });
    const name = req.body?.name?.trim() || tag.name;
    const color = req.body?.color || tag.color;
    if (!COLOR.test(color)) return res.status(400).json({ error: 'color must look like #a1b2c3' });
    db.prepare('UPDATE user_tags SET name = ?, color = ? WHERE id = ?').run(name, color, tag.id);
    res.json({ tags: list(req.user.id) });
  });

  r.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM user_tags WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ tags: list(req.user.id) });
  });

  return r;
}
