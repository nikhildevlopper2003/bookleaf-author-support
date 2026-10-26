import { z } from 'zod';
import { complete, AiUnavailableError } from './client.js';
import { classifyWithRules } from './fallback.js';
import { CATEGORIES, PRIORITIES } from './constants.js';

const MAX_DESCRIPTION_CHARS = 1500;

const SYSTEM = `You triage support tickets for BookLeaf Publishing, a self-publishing company.
Classify each ticket and rate its urgency. Reply with a single JSON object and nothing else:
{"category": <one of the categories>, "priority": <Critical|High|Medium|Low>, "reasoning": <one short sentence>}

Categories:
- Royalty & Payments: royalty amounts, missing or late payouts, bank details, sales figures
- ISBN & Metadata Issues: wrong/duplicate ISBN, incorrect title/author/description data on a listing
- Printing & Quality: misprints, binding, colour, damaged copies, reprints
- Distribution & Availability: book unavailable or missing on Amazon/Flipkart/etc, listing problems
- Book Status & Production Updates: where a book is in production, delays, timelines
- General Inquiry: anything else (account questions, how-to, bio/description updates)

Priority:
- Critical: money owed for a long time with nothing received, legal/fraud language, or a published book effectively unsellable
- High: ISBN errors, defective printed copies, book unavailable on a platform, overdue payouts, long unexplained delays
- Medium: routine questions needing a lookup or action by the team
- Low: informational or cosmetic requests that can wait`;

const resultSchema = z.object({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  reasoning: z.string().max(300).default(''),
});

// Per the KB, ISBN errors are always treated as high priority regardless of how the author words it.
const ISBN_ERROR = /\b(wrong|different|duplicate|mismatch\w*|incorrect|error)\b/i;
function applyPolicyFloor(result, text) {
  if (result.category === 'ISBN & Metadata Issues' && ISBN_ERROR.test(text)) {
    if (['Medium', 'Low'].includes(result.priority)) return { ...result, priority: 'High' };
  }
  return result;
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON in model output');
  return JSON.parse(text.slice(start, end + 1));
}

// One call for category + priority. Sends only subject, truncated description and book status.
// Returns { category, priority, reasoning, source: 'ai' | 'fallback' }.
export async function classifyTicket({ subject, description, bookStatus }) {
  const text = `${subject}\n${description}`;
  const user = [
    `Subject: ${subject}`,
    bookStatus ? `Linked book status: ${bookStatus}` : 'Linked book: none (account level)',
    `Description: ${description.slice(0, MAX_DESCRIPTION_CHARS)}`,
  ].join('\n');

  try {
    const { text: raw } = await complete({ system: SYSTEM, user, maxTokens: 120, temperature: 0 });
    const parsed = resultSchema.parse(extractJson(raw));
    return { ...applyPolicyFloor(parsed, text), source: 'ai' };
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) {
      console.warn('Classification output rejected, using rules:', err.message);
    } else {
      console.warn('Classification fell back to rules:', err.message);
    }
    return { ...classifyWithRules({ subject, description }), source: 'fallback' };
  }
}
