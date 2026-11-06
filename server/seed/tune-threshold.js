// Threshold tuning helper: `node seed/tune-threshold.js [threshold]`
// Scores every pair of essay prompts from *different* schools in seed/colleges.json with the real
// reuse engine, then prints how many pairs each threshold would flag plus the pairs near the cut,
// so you can eyeball whether matches above it are genuinely reusable and the ones below aren't.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_THRESHOLD, buildIdf, similarity } from '../src/reuse.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const { colleges } = JSON.parse(fs.readFileSync(path.join(here, 'colleges.json'), 'utf8'));
const threshold = Number(process.argv[2]) || DEFAULT_THRESHOLD;

const prompts = colleges.flatMap((c) =>
  c.requirements
    .filter((r) => r.type === 'essay' && !r.shared_key && r.prompt_text)
    .map((r) => ({ ...r, school: c.name, id: `${c.name} / ${r.title}` })),
);
const idf = buildIdf(prompts.map((p) => p.prompt_text));

const pairs = [];
for (let i = 0; i < prompts.length; i++) {
  for (let j = i + 1; j < prompts.length; j++) {
    if (prompts[i].school === prompts[j].school) continue;
    const sim = similarity(prompts[i], prompts[j], idf);
    pairs.push({ a: prompts[i], b: prompts[j], ...sim });
  }
}
pairs.sort((x, y) => y.score - x.score);

console.log(`${prompts.length} school-specific prompts, ${pairs.length} cross-school pairs\n`);
console.log('threshold  pairs flagged  per prompt (avg)');
for (const t of [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6]) {
  const n = pairs.filter((p) => p.score >= t).length;
  console.log(`${t.toFixed(2).padStart(9)}  ${String(n).padStart(13)}  ${((2 * n) / prompts.length).toFixed(1).padStart(16)}`);
}

const fmt = (p) =>
  `${p.score.toFixed(3)}  tags ${p.tagScore.toFixed(2)} text ${p.textScore.toFixed(2)}  ${p.a.id}  <->  ${p.b.id}  [${p.sharedTopics.join(', ')}]`;
console.log(`\nJust above ${threshold}:`);
pairs.filter((p) => p.score >= threshold).slice(-12).forEach((p) => console.log('  ' + fmt(p)));
console.log(`\nJust below ${threshold}:`);
pairs.filter((p) => p.score < threshold).slice(0, 12).forEach((p) => console.log('  ' + fmt(p)));
console.log('\nTop 10:');
pairs.slice(0, 10).forEach((p) => console.log('  ' + fmt(p)));
