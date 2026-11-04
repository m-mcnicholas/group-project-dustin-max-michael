// Essay reuse engine: pure functions only (no DB access), so it's easy to unit test.
//
// similarity(reqA, reqB) = TAG_WEIGHT * Jaccard(topic tags) + TEXT_WEIGHT * cosine(TF-IDF of prompt text)
//
// A "requirement" here is a plain object: { id, prompt_text, topics: string[], word_limit, shared_key }

export const TAG_WEIGHT = 0.6;
export const TEXT_WEIGHT = 0.4;
// Tuned against the real 2026-27 seed data (run `node seed/tune-threshold.js`): at 0.35 most extra matches were
// half-tag-overlap pairs with ~13% wording overlap (noise); 0.40 keeps genuine pairs like Brown/Princeton "joy".
export const DEFAULT_THRESHOLD = 0.4;

// Small hand-rolled stopword list. Includes words that appear in almost every
// essay prompt ("describe", "experience", ...) so they don't inflate similarity.
const STOPWORDS = new Set(`
a about above after again against all also am an and any are as at be because been before being below
between both but by can could did do does doing down during each few for from further had has have having
he her here hers herself him himself his how i if in into is it its itself just me more most my myself no
nor not now of off on once only or other our ours ourselves out over own same she should so some such than
that the their theirs them themselves then there these they this those through to too under until up very
was we were what when where which while who whom why will with would you your yours yourself yourselves
describe tell us share please discuss explain essay prompt response words word limit use may might one
experience experiences time way something someone think thought give example examples
`.split(/\s+/).filter(Boolean));

/**
 * Very light suffix stemmer so "served"/"serving"/"serves" and "volunteer"/"volunteering" match.
 * Deliberately conservative: only strips when a stem of 4+ letters remains.
 */
export function stem(t) {
  const strip = (suffix, add = '') => (t.length - suffix.length >= 4 && t.endsWith(suffix) ? t.slice(0, -suffix.length) + add : null);
  const s =
    strip('ies', 'y') ??
    strip('ing') ??
    strip('ed') ??
    (t.endsWith('ss') || t.endsWith('us') || t.endsWith('is') ? null : strip('s')) ??
    t;
  // Drop a final "e" so serve/served/serves and change/changed agree.
  return s.length >= 5 && s.endsWith('e') ? s.slice(0, -1) : s;
}

/** Lowercase, split on non-letters, drop stopwords and very short tokens, light stemming. */
export function tokenize(text = '') {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .map(stem);
}

/** Inverse document frequency over a corpus of prompt strings (smoothed). */
export function buildIdf(prompts) {
  const docs = prompts.map((p) => new Set(tokenize(p)));
  const df = new Map();
  for (const doc of docs) for (const t of doc) df.set(t, (df.get(t) || 0) + 1);
  const n = docs.length;
  const idf = new Map();
  for (const [t, count] of df) idf.set(t, Math.log((n + 1) / (count + 1)) + 1);
  return idf;
}

/** TF-IDF vector as a Map(term -> weight). Unknown terms get the max-rarity idf. */
export function tfidf(text, idf) {
  const tokens = tokenize(text);
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  const fallback = idf.size ? Math.max(...idf.values()) : 1;
  const vec = new Map();
  for (const [t, count] of tf) vec.set(t, (count / tokens.length) * (idf.get(t) ?? fallback));
  return vec;
}

export function cosine(a, b) {
  let dot = 0;
  for (const [t, w] of a) if (b.has(t)) dot += w * b.get(t);
  const norm = (v) => Math.sqrt([...v.values()].reduce((s, w) => s + w * w, 0));
  const denom = norm(a) * norm(b);
  return denom === 0 ? 0 : dot / denom;
}

export function jaccard(a = [], b = []) {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Score how well an essay written for reqA could be reused for reqB.
 * @param idf optional precomputed IDF; defaults to an IDF over just these two prompts.
 */
export function similarity(reqA, reqB, idf) {
  if (reqA.shared_key && reqA.shared_key === reqB.shared_key) {
    return { score: 1, tagScore: 1, textScore: 1, sharedTopics: [], sameSharedKey: true };
  }
  const tagScore = jaccard(reqA.topics, reqB.topics);
  const vocab = idf || buildIdf([reqA.prompt_text || '', reqB.prompt_text || '']);
  const textScore = cosine(tfidf(reqA.prompt_text || '', vocab), tfidf(reqB.prompt_text || '', vocab));
  const sharedTopics = (reqA.topics || []).filter((t) => (reqB.topics || []).includes(t));
  return {
    score: TAG_WEIGHT * tagScore + TEXT_WEIGHT * textScore,
    tagScore,
    textScore,
    sharedTopics,
    sameSharedKey: false,
  };
}

/** "needs trimming: 650 → 250 words", or null if it fits / no limit. */
export function wordLimitNote(wordCount, wordLimit) {
  if (!wordLimit || wordCount <= wordLimit) return null;
  return `needs trimming: ${wordCount} → ${wordLimit} words`;
}

const pretty = (topic) => topic.replace(/_/g, ' ');

/** Human-readable reason string for a suggestion. */
export function describeMatch(sim, wordCount, wordLimit) {
  const parts = [];
  if (sim.sameSharedKey) parts.push('Same shared prompt');
  else {
    if (sim.sharedTopics.length) parts.push(`Shares topic: ${sim.sharedTopics.map(pretty).join(', ')}`);
    parts.push(`prompt wording ${Math.round(sim.textScore * 100)}% similar`);
  }
  const trim = wordLimitNote(wordCount, wordLimit);
  if (trim) parts.push(trim);
  return parts.join(' · ');
}

/**
 * Given a just-completed essay, find which other requirements it could be reused for.
 *
 * @param {object}   args
 * @param {object}   args.essay        { id, word_count }
 * @param {object[]} args.sources      requirements the essay is assigned to
 * @param {object[]} args.candidates   the user's other incomplete essay requirements
 * @param {string[]} [args.corpus]     prompt texts to build IDF from (defaults to sources + candidates)
 * @param {number}   [args.threshold]
 * @returns {{requirement_id, essay_id, score, reason}[]} best match per candidate, above threshold
 */
export function findReuseSuggestions({ essay, sources, candidates, corpus, threshold = DEFAULT_THRESHOLD }) {
  const sourceIds = new Set(sources.map((s) => s.id));
  const idf = buildIdf(corpus || [...sources, ...candidates].map((r) => r.prompt_text || ''));
  const out = [];
  for (const cand of candidates) {
    if (sourceIds.has(cand.id)) continue;
    let best = null;
    for (const src of sources) {
      const sim = similarity(src, cand, idf);
      if (!best || sim.score > best.score) best = sim;
    }
    if (best && best.score >= threshold) {
      out.push({
        requirement_id: cand.id,
        essay_id: essay.id,
        score: Number(best.score.toFixed(3)),
        reason: describeMatch(best, essay.word_count, cand.word_limit),
        sameSharedKey: best.sameSharedKey,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export function countWords(text = '') {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}
