# Approach write-up

**What I prioritised.** The ticket lifecycle end to end, then the AI layer, since that carries the most weight. An author raises a ticket, it is triaged automatically, an admin gets a grounded draft, edits and sends it, and the author sees the reply live. Everything else (books page, filters, notes, assignment) was built around that path.

**How the AI is used.** Two small, separate calls. Triage (category + priority in one JSON reply) runs on creation, and a reply draft runs when an admin opens a ticket. Each call gets only what it needs: the matching knowledge-base section, the tone rules, one example, structured facts about the linked book, and the last few messages. Dates such as the next payout are computed in code rather than left to the model, and the one hard policy in the KB (ISBN errors are high priority) is enforced in code after the model answers. Drafts are cached so reopening a ticket is free.

**Trade-offs.**
- SQLite and an in-memory SSE hub keep setup trivial and are fine for one instance. They are the first things I would replace.
- Triage is asynchronous, so authors never wait on a model. The cost is a short "Classifying..." state in the admin queue.
- Drafts are generated on open, not on arrival. That saves tokens on tickets nobody opens quickly, at the price of a second or two of waiting.
- If the AI is down, a keyword fallback still routes the ticket and admins write replies by hand. It is cruder than the model, so the UI labels where each value came from.
- Attachments are UI only, as allowed.

**Taking this to production.**
1. Postgres, Redis (pub/sub for live updates, shared rate limits), and a queue for triage with retries so a model outage backfills classification instead of staying on rules.
2. A labelled set of past tickets and a scoring script so prompt or model changes are measured on classification accuracy and draft quality, not eyeballed.
3. Real data in the prompt: royalty line items per platform, bank-details status and production stage history, so drafts can answer "why is my royalty ₹3,000" with numbers.
4. Email notifications, file storage for attachments, SSO for admins, an audit trail of who changed what, and an SLA view built on priority and age.
5. Track draft acceptance (sent as-is, edited, discarded) to find where the model is weakest.
