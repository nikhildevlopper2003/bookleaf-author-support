// Keyword rules for when the LLM is unreachable. Rough, but the ticket still lands in a sensible queue.
const CATEGORY_RULES = [
  ['ISBN & Metadata Issues', /\b(isbn|barcode|metadata|wrong book|duplicate)\b/i],
  ['Printing & Quality', /\b(print|printed|misprint|blurry|binding|misaligned|quality|reprint|defect|damaged|colou?r)\b/i],
  ['Distribution & Availability', /\b(unavailable|out of stock|not showing|not listed|listing|amazon|flipkart|available)\b/i],
  ['Royalty & Payments', /\b(royalt\w*|payment|payout|paid|bank|transfer|earnings?)\b/i],
  ['Book Status & Production Updates', /\b(typesett\w*|proof\w*|cover design|editing|production|status|delay\w*)\b/i],
];

const CRITICAL = /\b(legal|lawyer|fraud|scam|police|never received|not received any|no royalty|haven'?t received any)\b/i;
const HIGH = /\b(isbn|wrong|duplicate|missing|overdue|months?|urgent|unavailable|still waiting|terrible|defect\w*|not paid)\b/i;
const LOW = /\b(bio|just wondering|how (do|can) i|suggestion|feedback)\b/i;

export function classifyWithRules({ subject, description }) {
  const text = `${subject}\n${description}`;
  const category = CATEGORY_RULES.find(([, re]) => re.test(text))?.[0] ?? 'General Inquiry';

  let priority = 'Medium';
  if (CRITICAL.test(text)) priority = 'Critical';
  else if (HIGH.test(text) || category === 'ISBN & Metadata Issues') priority = 'High';
  else if (LOW.test(text) || category === 'General Inquiry') priority = 'Low';

  return {
    category,
    priority,
    reasoning: 'Assigned by keyword rules because the AI service was unavailable.',
  };
}
