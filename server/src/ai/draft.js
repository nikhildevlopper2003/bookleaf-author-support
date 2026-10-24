import { complete } from './client.js';
import { knowledgeFor } from './knowledgeBase.js';

const MAX_HISTORY_MESSAGES = 4;
const MAX_MESSAGE_CHARS = 1000;
const MAX_BOOKS_IN_CONTEXT = 6;

const SYSTEM = `You are a support representative at BookLeaf Publishing writing a reply to an author.
You are drafting for a human admin who will review and edit before sending.

Rules:
- Use only the facts in the AUTHOR DATA and POLICY sections. If a fact you need is missing, say the team will check and give a timeline; never invent figures, dates or statuses.
- Follow the tone guidelines exactly. Open by acknowledging the author's concern, then answer.
- Quote real numbers (copies sold, royalty pending, last payout date, status) when they are provided and relevant.
- If the issue is BookLeaf's fault, say so plainly.
- End with a clear next step.
- Plain text, no markdown, no subject line. Start with "Hi <first name>," and sign off as "BookLeaf Author Support Team".
- Keep it under 180 words.`;

const inr = (n) => (n == null ? 'n/a' : `Rs ${Number(n).toLocaleString('en-IN')}`);

/** Royalties are paid within 45 days of quarter end. Returns the first such date on/after `today`. */
export function nextPayoutDate(today = new Date()) {
  const year = today.getUTCFullYear();
  const candidates = [year - 1, year, year + 1].flatMap((y) =>
    [2, 5, 8, 11].map((m) => {
      const qe = new Date(Date.UTC(y, m + 1, 0)); // last day of Mar/Jun/Sep/Dec
      return { qe, due: new Date(qe.getTime() + 45 * 86400000) };
    })
  );
  return candidates.find((c) => c.due >= today);
}

const fmtDate = (d) => d.toISOString().slice(0, 10);

function describeBook(b) {
  const parts = [`"${b.title}" (${b.id}) status: ${b.status}`];
  if (b.isbn) parts.push(`ISBN ${b.isbn}`);
  if (b.publication_date) parts.push(`published ${b.publication_date}`);
  if (b.mrp != null) parts.push(`MRP ${inr(b.mrp)}`);
  parts.push(`sold ${b.copies_sold}`);
  parts.push(`royalty earned ${inr(b.royalty_earned)}, paid ${inr(b.royalty_paid)}, pending ${inr(b.royalty_pending)}`);
  parts.push(`last payout ${b.last_payout_date ?? 'none yet'}`);
  if (b.print_partner) parts.push(`printer ${b.print_partner}`);
  const platforms = JSON.parse(b.available_on || '[]');
  if (platforms.length) parts.push(`listed on ${platforms.join(', ')}`);
  return `- ${parts.join('; ')}`;
}

/** Compact, structured facts about the author. Only the linked book if there is one. */
function authorData({ author, book, books }) {
  const lines = [`Author: ${author.name}`];
  if (book) {
    lines.push('Book this ticket is about:', describeBook(book));
  } else {
    lines.push('Author books (no specific book selected):');
    books.slice(0, MAX_BOOKS_IN_CONTEXT).forEach((b) => lines.push(describeBook(b)));
  }
  return lines.join('\n');
}

function history(messages) {
  return messages
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => `${m.sender_role === 'admin' ? 'BookLeaf' : 'Author'}: ${m.body.slice(0, MAX_MESSAGE_CHARS)}`)
    .join('\n');
}

/**
 * Build the user prompt. Context stays small: one KB section (matching the category), one example,
 * the relevant book(s) and the last few thread messages, not the whole KB or ticket history.
 */
export function buildDraftPrompt({ ticket, author, book, books, messages, today = new Date() }) {
  const kb = knowledgeFor(ticket.category);
  const payout = nextPayoutDate(today);

  return [
    `TODAY: ${fmtDate(today)}`,
    `COMPANY:\n${kb.overview}`,
    `POLICY:\n${kb.policy}`,
    `TONE GUIDELINES:\n${kb.tone}`,
    `EXAMPLE OF A GOOD RESPONSE:\n${kb.example}`,
    `AUTHOR DATA:\n${authorData({ author, book, books })}`,
    `Next royalty payout date (quarter ending ${fmtDate(payout.qe)} + 45 days): ${fmtDate(payout.due)}. Minimum payout threshold Rs 1,000.`,
    `TICKET (${ticket.category}, priority ${ticket.priority}):\nSubject: ${ticket.subject}`,
    `CONVERSATION SO FAR:\n${history(messages)}`,
    'Write the reply now.',
  ].join('\n\n');
}

export async function generateDraft(input) {
  const { text, usage } = await complete({
    system: SYSTEM,
    user: buildDraftPrompt(input),
    maxTokens: 450,
    temperature: 0.4,
  });
  return { draft: text, usage };
}
