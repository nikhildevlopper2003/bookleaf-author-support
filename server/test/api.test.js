import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Must be set before the app modules load. No API key: exercises the fallback path.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bookleaf-'));
process.env.DATABASE_PATH = path.join(tmp, 'test.db');
process.env.ANTHROPIC_API_KEY = '';
process.env.NODE_ENV = 'test';

let server;
let base;

const call = async (method, url, { token, body } = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const login = async (email, password) => (await call('POST', '/api/auth/login', { body: { email, password } })).data?.token;

before(async () => {
  const { seed } = await import('../src/db/seed.js');
  const { createApp } = await import('../src/app.js');
  seed();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  const { db } = await import('../src/db/index.js');
  db.close(); // Windows keeps the file locked otherwise
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('login rejects bad credentials and validates input', async () => {
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'priya.sharma@email.com', password: 'nope' } })).status, 401);
  const bad = await call('POST', '/api/auth/login', { body: { email: 'not-an-email', password: '' } });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.error.details.length >= 1);
});

test('every route except login and health requires a token', async () => {
  assert.equal((await call('GET', '/api/books')).status, 401);
  assert.equal((await call('GET', '/api/tickets')).status, 401);
});

test('authors only see their own books', async () => {
  const priya = await login('priya.sharma@email.com', 'author123');
  const mine = await call('GET', '/api/books', { token: priya });
  assert.deepEqual(mine.data.items.map((b) => b.id), ['BK001', 'BK002']);
  assert.equal((await call('GET', '/api/books/BK003', { token: priya })).status, 404);
});

test('book still in production has null MRP and royalty fields handled', async () => {
  const sneha = await login('sneha.kulkarni@email.com', 'author123');
  const { data } = await call('GET', '/api/books/BK013', { token: sneha });
  assert.equal(data.book.isPublished, false);
  assert.equal(data.book.mrp, null);
});

test('ticket lifecycle: create, auto triage, admin reply, author sees it', async () => {
  const rohit = await login('rohit.kapoor@email.com', 'author123');
  const admin = await login('admin@bookleaf.example', 'admin123');

  const created = await call('POST', '/api/tickets', {
    token: rohit,
    body: {
      bookId: 'BK003',
      subject: 'No royalty received',
      description: "I haven't received any royalty for 6 months, please help.",
    },
  });
  assert.equal(created.status, 201);
  const id = created.data.ticket.id;
  assert.equal(created.data.ticket.category, undefined, 'authors never see triage fields');

  // triage runs after the response; give it a moment
  await new Promise((r) => setTimeout(r, 200));
  const adminView = await call('GET', `/api/tickets/${id}`, { token: admin });
  assert.equal(adminView.data.ticket.category, 'Royalty & Payments');
  assert.equal(adminView.data.ticket.priority, 'Critical');
  assert.equal(adminView.data.ticket.categorySource, 'fallback');

  // admin overrides classification
  const patched = await call('PATCH', `/api/tickets/${id}`, {
    token: admin,
    body: { category: 'General Inquiry', priority: 'Low', assignee: 'me' },
  });
  assert.equal(patched.data.ticket.categorySource, 'admin');
  assert.equal(patched.data.ticket.assignedTo.name, 'Support Admin');

  // AI down: draft endpoint degrades rather than erroring
  const draft = await call('GET', `/api/tickets/${id}/draft`, { token: admin });
  assert.equal(draft.status, 200);
  assert.equal(draft.data.draft, null);
  assert.equal(draft.data.aiAvailable, false);

  await call('POST', `/api/tickets/${id}/notes`, { token: admin, body: { body: 'internal only' } });
  const reply = await call('POST', `/api/tickets/${id}/messages`, { token: admin, body: { body: 'We are on it.' } });
  assert.equal(reply.data.ticket.status, 'In Progress');

  const authorView = await call('GET', `/api/tickets/${id}`, { token: rohit });
  assert.equal(authorView.data.ticket.messages.at(-1).body, 'We are on it.');
  assert.equal(authorView.data.ticket.notes, undefined);
  assert.equal(JSON.stringify(authorView.data).includes('internal only'), false);
});

test('role and ownership checks', async () => {
  const priya = await login('priya.sharma@email.com', 'author123');
  const rohit = await login('rohit.kapoor@email.com', 'author123');
  const admin = await login('admin@bookleaf.example', 'admin123');

  const t = await call('POST', '/api/tickets', {
    token: priya,
    body: { bookId: null, subject: 'Update bio', description: 'Can I update my author bio on the store page?' },
  });
  const id = t.data.ticket.id;

  assert.equal((await call('GET', `/api/tickets/${id}`, { token: rohit })).status, 404);
  assert.equal((await call('PATCH', `/api/tickets/${id}`, { token: priya, body: { status: 'Closed' } })).status, 403);
  assert.equal((await call('POST', '/api/tickets', { token: admin, body: { subject: 'x', description: 'y' } })).status, 403);
  // cannot attach a ticket to someone else's book
  const other = await call('POST', '/api/tickets', {
    token: priya,
    body: { bookId: 'BK003', subject: 'Not mine', description: 'This book belongs to another author.' },
  });
  assert.equal(other.status, 400);
});

test('queue ranks unresolved + urgent + oldest first and honours filters', async () => {
  const admin = await login('admin@bookleaf.example', 'admin123');
  const all = await call('GET', '/api/tickets', { token: admin });
  const open = all.data.items.filter((t) => !['Resolved', 'Closed'].includes(t.status));
  assert.ok(open.length >= 2);
  const rank = { Critical: 0, High: 1, Medium: 3, Low: 4 };
  for (let i = 1; i < open.length; i++) {
    assert.ok((rank[open[i - 1].priority] ?? 2) <= (rank[open[i].priority] ?? 2));
  }
  const filtered = await call('GET', '/api/tickets?priority=Low', { token: admin });
  assert.ok(filtered.data.items.every((t) => t.priority === 'Low'));
  assert.equal((await call('GET', '/api/tickets?status=Bogus', { token: admin })).status, 400);
});
