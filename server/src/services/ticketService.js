import { db } from '../db/index.js';
import { badRequest, notFound } from '../errors.js';
import { classifyTicket } from '../ai/classify.js';
import { generateDraft } from '../ai/draft.js';
import { AiUnavailableError } from '../ai/client.js';
import { publishTicketEvent } from './events.js';

const TICKET_SELECT = `
  SELECT t.*, a.name AS author_name, b.title AS book_title, b.status AS book_status,
         u.name AS assignee_name
  FROM tickets t
  JOIN authors a ON a.id = t.author_id
  LEFT JOIN books b ON b.id = t.book_id
  LEFT JOIN users u ON u.id = t.assigned_to`;

const messagesFor = (ticketId) =>
  db
    .prepare(
      `SELECT m.id, m.sender_role AS senderRole, m.body, m.created_at AS createdAt, u.name AS senderName
       FROM ticket_messages m JOIN users u ON u.id = m.sender_id
       WHERE m.ticket_id = ? ORDER BY m.id`
    )
    .all(ticketId);

const notesFor = (ticketId) =>
  db
    .prepare(
      `SELECT n.id, n.body, n.created_at AS createdAt, u.name AS adminName
       FROM ticket_notes n JOIN users u ON u.id = n.admin_id
       WHERE n.ticket_id = ? ORDER BY n.id`
    )
    .all(ticketId);

const touch = (id) =>
  db.prepare(`UPDATE tickets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(id);

/** What an author may see: no AI triage fields, no internal notes. */
function toAuthorView(row) {
  return {
    id: row.id,
    subject: row.subject,
    status: row.status,
    book: row.book_id ? { id: row.book_id, title: row.book_title } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAdminView(row) {
  return {
    ...toAuthorView(row),
    author: { id: row.author_id, name: row.author_name },
    category: row.category,
    categorySource: row.category_source,
    priority: row.priority,
    prioritySource: row.priority_source,
    aiReasoning: row.ai_reasoning,
    assignedTo: row.assigned_to ? { id: row.assigned_to, name: row.assignee_name } : null,
  };
}

const rowById = (id) => db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(id);

function requireTicket(id) {
  const row = rowById(id);
  if (!row) throw notFound('Ticket not found');
  return row;
}

// ---------- author side ----------

export function createTicket(user, { bookId, subject, description }) {
  let book = null;
  if (bookId) {
    book = db.prepare('SELECT id, status FROM books WHERE id = ? AND author_id = ?').get(bookId, user.authorId);
    if (!book) throw badRequest('That book is not on your account');
  }

  const create = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO tickets (author_id, book_id, subject, description) VALUES (?, ?, ?, ?)')
      .run(user.authorId, book?.id ?? null, subject, description);
    db.prepare(
      `INSERT INTO ticket_messages (ticket_id, sender_role, sender_id, body) VALUES (?, 'author', ?, ?)`
    ).run(lastInsertRowid, user.id, description);
    return Number(lastInsertRowid);
  });
  const id = create();

  // Triage runs after the response is sent, so a slow or failing AI call never blocks submission.
  const triage = triageTicket(id, { subject, description, bookStatus: book?.status });

  return { ticket: toAuthorView(requireTicket(id)), triage };
}

async function triageTicket(id, input) {
  try {
    const r = await classifyTicket(input);
    db.prepare(
      `UPDATE tickets SET category = ?, category_source = ?, priority = ?, priority_source = ?, ai_reasoning = ?
       WHERE id = ? AND category IS NULL`
    ).run(r.category, r.source, r.priority, r.source, r.reasoning, id);
  } catch (err) {
    console.error(`Triage failed for ticket ${id}:`, err);
  }
  touch(id);
  publishTicketEvent('ticket.updated', requireTicket(id));
}

export function listAuthorTickets(authorId) {
  return db
    .prepare(`${TICKET_SELECT} WHERE t.author_id = ? ORDER BY t.updated_at DESC`)
    .all(authorId)
    .map((row) => ({ ...toAuthorView(row), messages: messagesFor(row.id) }));
}

export function getAuthorTicket(user, id) {
  const row = requireTicket(id);
  // 404 rather than 403 so ticket ids of other authors are not discoverable
  if (row.author_id !== user.authorId) throw notFound('Ticket not found');
  return { ...toAuthorView(row), messages: messagesFor(id) };
}

export function addAuthorMessage(user, id, body) {
  const row = requireTicket(id);
  if (row.author_id !== user.authorId) throw notFound('Ticket not found');
  if (row.status === 'Closed') throw badRequest('This ticket is closed. Please open a new one.');

  db.prepare(
    `INSERT INTO ticket_messages (ticket_id, sender_role, sender_id, body) VALUES (?, 'author', ?, ?)`
  ).run(id, user.id, body);
  // an author replying to a resolved ticket means it is not resolved
  if (row.status === 'Resolved') db.prepare(`UPDATE tickets SET status = 'Open' WHERE id = ?`).run(id);
  touch(id);

  const updated = requireTicket(id);
  publishTicketEvent('ticket.updated', updated);
  return { ...toAuthorView(updated), messages: messagesFor(id) };
}

// ---------- admin side ----------

const PRIORITY_RANK = `CASE t.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 ELSE 2 END`;

export function listAdminTickets(admin, f) {
  const where = [];
  const params = {};
  const add = (sql, key, value) => {
    where.push(sql);
    if (key) params[key] = value;
  };
  if (f.status) add('t.status = @status', 'status', f.status);
  if (f.category) add('t.category = @category', 'category', f.category);
  if (f.priority) add('t.priority = @priority', 'priority', f.priority);
  if (f.from) add('date(t.created_at) >= @from', 'from', f.from);
  if (f.to) add('date(t.created_at) <= @to', 'to', f.to);
  if (f.assigned === 'me') add('t.assigned_to = @me', 'me', admin.id);
  if (f.assigned === 'unassigned') add('t.assigned_to IS NULL');
  if (f.q) add('(t.subject LIKE @q OR a.name LIKE @q OR t.description LIKE @q)', 'q', `%${f.q}%`);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // Unresolved first, then most urgent, then oldest, so the top of the queue is what needs doing.
  const order = `ORDER BY (t.status IN ('Resolved','Closed')), ${PRIORITY_RANK}, t.created_at ASC`;
  const items = db
    .prepare(`${TICKET_SELECT} ${clause} ${order} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: f.limit, offset: f.offset })
    .map(toAdminView);
  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM tickets t JOIN authors a ON a.id = t.author_id ${clause}`)
    .get(params);
  return { items, total };
}

export function getAdminTicket(id) {
  const row = requireTicket(id);
  return { ...toAdminView(row), messages: messagesFor(id), notes: notesFor(id) };
}

export function updateTicket(admin, id, patch) {
  const row = requireTicket(id);
  const sets = [];
  const params = { id };

  if (patch.status) {
    sets.push('status = @status');
    params.status = patch.status;
  }
  if (patch.category) {
    sets.push("category = @category, category_source = 'admin'");
    params.category = patch.category;
  }
  if (patch.priority) {
    sets.push("priority = @priority, priority_source = 'admin'");
    params.priority = patch.priority;
  }
  if (patch.assignee !== undefined) {
    sets.push('assigned_to = @assignee');
    params.assignee = patch.assignee === 'me' ? admin.id : null;
  }
  // a changed category changes which KB section the draft should use
  if (patch.category && patch.category !== row.category) sets.push('draft = NULL, draft_for_message = NULL');

  db.prepare(`UPDATE tickets SET ${sets.join(', ')} WHERE id = @id`).run(params);
  touch(id);
  publishTicketEvent('ticket.updated', requireTicket(id));
  return getAdminTicket(id);
}

export function addNote(admin, id, body) {
  requireTicket(id);
  db.prepare('INSERT INTO ticket_notes (ticket_id, admin_id, body) VALUES (?, ?, ?)').run(id, admin.id, body);
  touch(id);
  return getAdminTicket(id);
}

export function adminReply(admin, id, { body, status }) {
  const row = requireTicket(id);
  if (row.status === 'Closed') throw badRequest('Ticket is closed. Reopen it before replying.');

  db.transaction(() => {
    db.prepare(
      `INSERT INTO ticket_messages (ticket_id, sender_role, sender_id, body) VALUES (?, 'admin', ?, ?)`
    ).run(id, admin.id, body);
    const nextStatus = status ?? (row.status === 'Open' ? 'In Progress' : row.status);
    db.prepare('UPDATE tickets SET status = ?, assigned_to = COALESCE(assigned_to, ?) WHERE id = ?').run(
      nextStatus,
      admin.id,
      id
    );
    touch(id);
  })();

  publishTicketEvent('ticket.updated', requireTicket(id));
  return getAdminTicket(id);
}

/**
 * Returns a cached draft when nothing has changed since it was written; otherwise asks the model.
 * Never throws for AI problems: the admin gets { draft: null, aiAvailable: false } and writes manually.
 */
export async function getDraft(id, { refresh = false } = {}) {
  const row = requireTicket(id);
  const messages = messagesFor(id);
  const lastMessageId = messages.at(-1)?.id ?? 0;

  if (!refresh && row.draft && row.draft_for_message === lastMessageId) {
    return { draft: row.draft, cached: true, aiAvailable: true };
  }
  if (!row.category) {
    return { draft: null, cached: false, aiAvailable: true, pending: true };
  }

  const author = db.prepare('SELECT * FROM authors WHERE id = ?').get(row.author_id);
  const books = db.prepare('SELECT * FROM books WHERE author_id = ?').all(row.author_id);
  const book = row.book_id ? books.find((b) => b.id === row.book_id) : null;

  try {
    const { draft, usage } = await generateDraft({ ticket: row, author, book, books, messages });
    db.prepare('UPDATE tickets SET draft = ?, draft_for_message = ? WHERE id = ?').run(draft, lastMessageId, id);
    console.info(`Draft for ticket ${id}: ${usage?.input_tokens ?? '?'} in / ${usage?.output_tokens ?? '?'} out tokens`);
    return { draft, cached: false, aiAvailable: true };
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    console.warn(`Draft unavailable for ticket ${id}:`, err.message);
    return { draft: null, cached: false, aiAvailable: false };
  }
}
