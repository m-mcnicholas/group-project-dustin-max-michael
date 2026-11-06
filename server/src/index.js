import { openDb } from './db.js';
import { createApp } from './app.js';

const PORT = process.env.PORT || 3001;
const db = openDb();
const count = db.prepare('SELECT COUNT(*) AS n FROM colleges WHERE created_by IS NULL').get().n;
if (count === 0) console.warn('⚠ No curated colleges in the database yet. Run `npm run seed`.');

createApp(db).listen(PORT, () => console.log(`Listening on http://localhost:${PORT} (API under /api)`));
