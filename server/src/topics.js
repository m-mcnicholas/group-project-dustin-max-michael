// Fixed topic vocabulary for essay prompts. Seed data and custom prompts must use these.
export const TOPICS = [
  'community_service',
  'challenge',
  'identity',
  'why_us',
  'why_major',
  'leadership',
  'intellectual_curiosity',
  'activity',
  'diversity',
  'growth',
  'personal_statement',
  'creativity',
  'family',
  'future_goals',
];

export const REQUIREMENT_TYPES = ['essay', 'rec', 'transcript', 'test_scores', 'portfolio', 'interview', 'fee'];

export function cleanTopics(topics) {
  return [...new Set((topics || []).filter((t) => TOPICS.includes(t)))];
}
