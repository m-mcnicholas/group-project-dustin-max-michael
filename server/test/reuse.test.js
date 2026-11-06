import { describe, it, expect } from 'vitest';
import {
  DEFAULT_THRESHOLD,
  countWords,
  findReuseSuggestions,
  jaccard,
  similarity,
  stem,
  tokenize,
  wordLimitNote,
} from '../src/reuse.js';

const serviceA = {
  id: 1,
  topics: ['community_service'],
  word_limit: 250,
  prompt_text: 'Describe a way you have served your community through volunteering. What impact did your service have?',
};
const serviceB = {
  id: 2,
  topics: ['community_service', 'growth'],
  word_limit: 300,
  prompt_text: 'Tell us about a volunteer experience serving your community and how it changed you.',
};
const whyUs = {
  id: 3,
  topics: ['why_us'],
  word_limit: 200,
  prompt_text: 'Why do you want to attend our university? What specific programs draw you to our campus?',
};
const challenge = {
  id: 4,
  topics: ['challenge'],
  word_limit: 250,
  prompt_text: 'Reflect on a time you faced a setback or obstacle. How did you respond and what did you learn?',
};

describe('helpers', () => {
  it('tokenize drops stopwords and short words', () => {
    expect(tokenize('Describe the way YOU served your community!')).toEqual(['serv', 'community']);
  });
  it('stem collapses common inflections but leaves short words alone', () => {
    expect(['served', 'serving', 'serves'].map(stem)).toEqual(['serv', 'serv', 'serv']);
    expect(stem('volunteering')).toBe('volunteer');
    expect(stem('studies')).toBe('study');
    expect(['change', 'changed'].map(stem)).toEqual(['chang', 'chang']);
    expect(['campus', 'class', 'thesis', 'red', 'bring'].map(stem)).toEqual(['campus', 'class', 'thesis', 'red', 'bring']);
  });
  it('jaccard', () => {
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
    expect(jaccard([], [])).toBe(0);
  });
  it('countWords', () => {
    expect(countWords('  one two\nthree ')).toBe(3);
    expect(countWords('')).toBe(0);
  });
});

describe('similarity', () => {
  it('two community-service prompts score above the threshold', () => {
    const sim = similarity(serviceA, serviceB);
    expect(sim.score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
    expect(sim.sharedTopics).toEqual(['community_service']);
  });

  it('"why us" vs "challenge" scores below the threshold', () => {
    expect(similarity(whyUs, challenge).score).toBeLessThan(DEFAULT_THRESHOLD);
  });

  it('same shared_key is a perfect match', () => {
    const a = { id: 10, shared_key: 'common_app_personal', topics: [], prompt_text: 'x' };
    const b = { id: 11, shared_key: 'common_app_personal', topics: [], prompt_text: 'y' };
    expect(similarity(a, b)).toMatchObject({ score: 1, sameSharedKey: true });
  });
});

describe('word limit', () => {
  it('warns when the essay is too long', () => {
    expect(wordLimitNote(650, 250)).toBe('needs trimming: 650 → 250 words');
    expect(wordLimitNote(200, 250)).toBeNull();
    expect(wordLimitNote(900, null)).toBeNull();
  });
});

describe('findReuseSuggestions', () => {
  it('suggests the community-service prompt only, with a readable reason and trim warning', () => {
    const out = findReuseSuggestions({
      essay: { id: 99, word_count: 400 },
      sources: [serviceA],
      candidates: [serviceB, whyUs, challenge],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ requirement_id: 2, essay_id: 99 });
    expect(out[0].reason).toMatch(/Shares topic: community service/);
    expect(out[0].reason).toMatch(/prompt wording \d+% similar/);
    expect(out[0].reason).toMatch(/needs trimming: 400 → 300 words/);
  });
});
