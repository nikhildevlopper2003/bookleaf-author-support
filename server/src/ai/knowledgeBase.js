// BookLeaf knowledge base, split by topic so each AI call only carries what it needs
// (tone + the section for the ticket's category) instead of the whole document.

const overview = `BookLeaf Publishing is a self-publishing company operating in India and the US.
Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium, paid, with marketing and distribution add-ons).
BookLeaf handles cover design, typesetting, ISBN assignment, printing, distribution and royalty management.
In-house printing facility and warehouse are in Delhi. Print partners: Repro India and Epitome Books.`;

const sections = {
  'Royalty & Payments': `Royalty policy:
- 80/20 split: 80% of net profit per book goes to the author, 20% to BookLeaf.
- Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart) and shipping charges.
- Royalties are calculated quarterly and paid within 45 days of the quarter ending.
- Minimum payout threshold is Rs 1,000. Below that, royalties roll over to the next quarter.
- Payouts are bank transfers to the account linked in the author's dashboard.
- Authors can see a detailed royalty breakdown with sales per platform in their dashboard.`,

  'ISBN & Metadata Issues': `ISBN policy:
- Every book published through BookLeaf gets a unique ISBN assigned by BookLeaf, registered under BookLeaf's publisher imprint.
- An author who wants an ISBN under their own imprint must obtain it independently.
- ISBN errors (duplicate, wrong book linked) are high priority and escalated to the production team.
- Metadata updates (e.g. book description on Amazon) can be submitted via the dashboard or by emailing the BookLeaf team; changes reflect on platforms in 3-5 business days.`,

  'Printing & Quality': `Printing and quality:
- In-house printing handles most orders. Overflow or special formats go to Repro India or Epitome Books.
- Standard print turnaround is 5-7 business days from order confirmation.
- For quality issues (misprints, binding defects, colour inconsistency) BookLeaf arranges a free reprint after verification; the author may need to share photos of the defective copy.`,

  'Distribution & Availability': `Distribution:
- Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store.
- New listings usually go live 7-10 business days after publication is complete.
- A book showing as unavailable on a platform is usually a stock sync issue; the team can trigger a re-sync, which takes 24-48 hours.`,

  'Book Status & Production Updates': `Production stages, in order: Manuscript Received, Editing (if opted), Cover Design, Typesetting, Proofreading, ISBN Assignment, Printing, Distribution Setup, Published & Live.
- Authors are emailed at each stage.
- Delays usually happen at Cover Design (waiting for author approval) and Proofreading (revision rounds).`,

  'General Inquiry': `Metadata updates (e.g. changing a live book description) can be submitted via the dashboard or by emailing the BookLeaf team; they typically reflect on platforms in 3-5 business days.`,
};

export const toneGuidelines = `- Always empathetic and professional. Authors are partners, not customers to be managed.
- Acknowledge the author's concern before jumping to solutions.
- Be specific: use actual numbers, dates and statuses instead of vague reassurance.
- If something is BookLeaf's fault (delayed royalties, ISBN error), own it directly. No corporate deflection.
- If it needs escalation or investigation, give a clear timeline (e.g. "within 48 hours") rather than open-ended promises.
- Always end with a clear next step for the author and/or the BookLeaf team.`;

// Calibration examples per category: what a good response contains.
const examples = {
  'Royalty & Payments': `Query: "I published 4 months ago and still haven't received any royalty." -> Acknowledge the frustration, explain the quarterly cycle and 45-day window, check bank details are linked, give the specific next payout date, and if genuinely overdue escalate with a 48-hour resolution timeline.
Query: "I sold 200 copies but only received Rs 3,000." -> Explain the net profit calculation (MRP minus printing, platform commission, shipping), offer a line-by-line breakdown, do not be defensive.`,
  'ISBN & Metadata Issues': `Query: "Amazon shows a different ISBN than my physical copy." -> Treat as high priority, say plainly it is a serious data issue, confirm immediate escalation to the production team, give a 48-hour resolution timeline.`,
  'Printing & Quality': `Query: "Author copies arrived with blurry images and misaligned pages." -> Apologise sincerely, ask for photos of the defective copies, confirm a free reprint once verified, give a 5-7 business day reprint timeline.`,
  'Distribution & Availability': `Query: "Showing as Currently Unavailable on Amazon." -> Explain it is typically a stock sync issue, confirm the re-sync with the distribution team, set the expectation of 24-48 hours.`,
  'Book Status & Production Updates': `Query: "3 weeks in typesetting, when will it be done?" -> Check the actual status; if delayed be honest about why (e.g. waiting on author approval for proofs), give a specific updated timeline, frame delays collaboratively and never blame the author.`,
  'General Inquiry': `Query: "Can I update my book description on Amazon after it's live?" -> Yes, via dashboard or email to the team; changes reflect in 3-5 business days.`,
};

// Only the section for one category, to keep prompts small.
export function knowledgeFor(category) {
  const key = sections[category] ? category : 'General Inquiry';
  return {
    overview,
    policy: sections[key],
    example: examples[key],
    tone: toneGuidelines,
  };
}
