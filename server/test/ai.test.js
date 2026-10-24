import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyWithRules } from '../src/ai/fallback.js';
import { buildDraftPrompt, nextPayoutDate } from '../src/ai/draft.js';

test('rule fallback ranks a long-missing royalty above a bio change', () => {
  const royalty = classifyWithRules({
    subject: 'Royalty',
    description: "I haven't received any royalty for 6 months",
  });
  const bio = classifyWithRules({ subject: 'Bio', description: 'Can I update my author bio?' });
  assert.equal(royalty.category, 'Royalty & Payments');
  assert.equal(royalty.priority, 'Critical');
  assert.equal(bio.priority, 'Low');
});

test('rule fallback treats ISBN mismatches as high priority', () => {
  const r = classifyWithRules({ subject: 'ISBN', description: 'Amazon shows a different ISBN than my copy' });
  assert.equal(r.category, 'ISBN & Metadata Issues');
  assert.equal(r.priority, 'High');
});

test('next payout is 45 days after the nearest quarter end', () => {
  const p = nextPayoutDate(new Date('2025-11-01T00:00:00Z'));
  assert.equal(p.qe.toISOString().slice(0, 10), '2025-09-30');
  assert.equal(p.due.toISOString().slice(0, 10), '2025-11-14');
  const q = nextPayoutDate(new Date('2025-11-20T00:00:00Z'));
  assert.equal(q.due.toISOString().slice(0, 10), '2026-02-14');
});

test('draft prompt carries only the matching KB section and the linked book', () => {
  const book = {
    id: 'BK001', title: 'Whispers of the Ganges', isbn: '978', status: 'Published & Live', mrp: 399,
    copies_sold: 342, royalty_earned: 11970, royalty_paid: 8400, royalty_pending: 3570,
    last_payout_date: '2025-10-15', print_partner: 'In-House', available_on: '["Amazon India"]',
  };
  const prompt = buildDraftPrompt({
    ticket: { category: 'Royalty & Payments', priority: 'High', subject: 'Royalty low' },
    author: { name: 'Priya Sharma' },
    book,
    books: [book],
    messages: [{ sender_role: 'author', body: 'My royalty seems low' }],
    today: new Date('2025-12-02T00:00:00Z'),
  });
  assert.match(prompt, /80\/20 split/);
  assert.doesNotMatch(prompt, /Production stages/);
  assert.match(prompt, /pending Rs 3,570/);
  assert.match(prompt, /2026-02-14/);
});
