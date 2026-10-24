# BookLeaf Author Support & Communication Portal

A web app where authors raise support tickets and the BookLeaf ops team works through them, with AI doing the first-pass triage (category, priority) and drafting replies from the BookLeaf knowledge base.

- **Author portal**: sign in, see your books and royalties, raise a query, follow replies live.
- **Admin portal**: ticket queue with filters, AI category/priority (overridable), AI-drafted reply you can edit, internal notes, assignment, status changes.

Live demo: _add URL here after deploying_

## Test logins

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@bookleaf.example` | `admin123` |
| Author | `priya.sharma@email.com` (and the other nine authors in the sample data) | `author123` |

Every author in `server/data/bookleaf_sample_data.json` gets an account with their email from the file. Passwords come from `SEED_AUTHOR_PASSWORD` / `SEED_ADMIN_PASSWORD` and are for demo use only.

Handy author accounts for edge cases: `sneha.kulkarni@email.com` (a book still in cover design), `ananya.reddy@email.com` (nothing paid out yet), `kavita.deshmukh@email.com` (one book in typesetting, one live).

## Setup

Requires Node 20+.

```bash
npm run install:all          # installs server and client
cp server/.env.example server/.env
```

Edit `server/.env`:

| Variable | Notes |
| --- | --- |
| `ANTHROPIC_API_KEY` | Optional locally. Without it the app still works: triage uses keyword rules and AI drafts are switched off. |
| `AI_MODEL` | Defaults to `claude-haiku-5-5`. Set to whichever Haiku model your key can use. |
| `JWT_SECRET` | Required (non-default) when `NODE_ENV=production`. |
| `DATABASE_PATH` | SQLite file, default `server/data/bookleaf.db`. |

The database is created and seeded automatically on first start (seeding is idempotent).

### Run in development

Two terminals:

```bash
npm run dev:server     # API on http://localhost:4000
npm run dev:client     # UI on http://localhost:5173 (proxies /api to :4000)
```

### Run as a single production process

```bash
npm run build          # builds the React app into client/dist
npm start              # Express serves the API and the built client on :4000
```

### Tests

```bash
npm test
```

Covers auth, ownership and role checks, ticket lifecycle, queue ordering, the fallback classifier and prompt assembly. Tests run without an API key, so they exercise the degraded path.

### Deploy (Render)

`render.yaml` describes a single web service. Set `ANTHROPIC_API_KEY` in the dashboard; `JWT_SECRET` is generated. The SQLite file lives on a persistent disk (`/var/data`). On a plan without disks, drop the `disk` block and `DATABASE_PATH`: the app reseeds on every boot, but tickets are lost on redeploy.

## Architecture

```
server/src
  index.js, app.js, config.js     bootstrap, middleware wiring, env config
  db/                             SQLite schema and seed
  middleware/                     JWT auth + roles, zod validation, error handler
  routes/                         thin HTTP layer: auth, books, tickets, events
  services/ticketService.js       all ticket rules and queries
  services/events.js              SSE hub
  ai/                             client, classify, draft, knowledgeBase, fallback
client/src
  api.js, auth.jsx, useLive.js    fetch wrapper, session, SSE hook
  pages/author, pages/admin       the two portals
```

Decisions worth knowing about:

- **Node + Express + SQLite.** The data is small and relational (authors, books, tickets, messages). SQLite keeps setup to zero and the whole schema is in one readable file. Moving to Postgres would only touch `db/` and the SQL strings in `ticketService.js`.
- **Routes stay thin, rules live in the service.** Routes validate input (zod) and call the service; the service owns ownership checks, status transitions and queries. The AI code sits behind its own module and is never imported by routes directly.
- **One ticket route set, role-aware.** `GET /tickets` returns the author's tickets or the admin queue depending on the token, which keeps the URL space small. Role gates (`requireRole`) sit on admin-only mutations.
- **Authors cannot see triage data.** Category, priority, AI reasoning and internal notes are only in the admin serializer. A ticket that belongs to someone else returns 404, not 403, so ids cannot be probed.
- **Real time with Server-Sent Events.** The server pushes `ticket.updated {ticketId}` to the ticket's author and to all admins; the client refetches over REST. The payload carries no ticket content, so nothing sensitive goes over the stream. EventSource cannot set headers, so the JWT is accepted as `?token=` on that one endpoint. A 60 s poll is a safety net. The hub is in-memory, so scaling beyond one instance means Redis pub/sub.
- **Triage is asynchronous.** `POST /tickets` returns right away; classification runs after the response. A slow model call never blocks an author, and the admin queue shows "Classifying..." until it lands.
- **Thread model.** The author's original description is stored as the first message, so the author view, admin view and AI prompt all read from one thread.

## AI integration

**Model:** Anthropic Claude Haiku. The work is short-text classification and templated, policy-grounded drafting, where a small model is accurate enough and cheap enough to call on every ticket. It follows "reply with JSON only" reliably, and a single provider SDK keeps the code small. The model id is an env var, so moving to a larger model for drafts is a config change.

**Calls**

1. **Classify + prioritise** (on ticket creation, one call, `max_tokens` 120, temperature 0). Input is the subject, the description truncated to 1,500 characters and the linked book's status. The system prompt defines the six categories and a priority rubric (Critical for long-missing money or legal language, High for ISBN errors, defective prints, unavailable listings, and so on). The reply is parsed and validated against the enums; anything invalid is treated as a failure. A small rule layer then applies a KB policy the model should not be able to talk its way out of: ISBN errors are never below High.
2. **Draft reply** (when an admin opens a ticket, `max_tokens` 450). The prompt is assembled from:
   - the tone guidelines (always),
   - **only the KB section for the ticket's category**, plus one calibration example for that category,
   - structured facts about the linked book (status, ISBN, MRP, copies sold, earned/paid/pending, last payout, platforms), or a compact list of the author's books when the ticket is account level,
   - the next payout date computed in code (quarter end + 45 days), so the model does not do date arithmetic,
   - the last four thread messages, each truncated.

   The system prompt tells the model to use only the supplied facts, to say the team will check rather than invent figures, to own BookLeaf mistakes, and to end with a concrete next step. This is how replies end up quoting "₹3,570 pending, last paid 15 Oct 2025" instead of generic reassurance.

**Cost control**

- No full knowledge base or full ticket history is ever sent; typical draft input is a few hundred tokens of KB plus a few hundred of facts and thread.
- Classification output is capped at 120 tokens; drafts at 450.
- Drafts are cached on the ticket and reused until the thread or category changes. Reopening a ticket costs nothing; "Regenerate" is an explicit admin action.
- Drafts are generated lazily when an admin opens the ticket, not for every incoming ticket.
- Token usage for each draft is logged.

**Failure handling**

All model calls go through one function that turns any failure (no key, timeout, 429, 5xx, empty reply, unparseable output) into `AiUnavailableError`, with a 15 s timeout and one SDK retry.

- Classification falls back to keyword rules (`ai/fallback.js`). The ticket is still created and routed; the admin UI labels the category as "set by keyword rules (AI unavailable)" so people know to check it.
- Draft returns `{ draft: null, aiAvailable: false }`; the composer shows a notice and the admin writes the reply by hand. Nothing else in the ticket flow depends on the AI.

**Key security:** the key is read from `ANTHROPIC_API_KEY` in the server environment only. It is never sent to or bundled into the client, and `.env` is git-ignored.

## API

Full spec: [`server/docs/openapi.yaml`](server/docs/openapi.yaml) (paste into editor.swagger.io, or import into Postman). Summary:

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | public | Email + password, returns JWT |
| GET | `/api/auth/me` | any | Current user |
| GET | `/api/books` | any | Own books (author) / all, filter by `authorId` (admin) |
| GET | `/api/books/:id` | any | One book (404 if not yours) |
| GET | `/api/tickets` | any | Own tickets (author) / queue with filters (admin) |
| POST | `/api/tickets` | author | Raise a ticket |
| GET | `/api/tickets/:id` | any | Ticket + thread (+ notes, triage for admin) |
| PATCH | `/api/tickets/:id` | admin | Status, override category/priority, assign |
| POST | `/api/tickets/:id/messages` | any | Reply in the thread |
| POST | `/api/tickets/:id/notes` | admin | Internal note |
| GET | `/api/tickets/:id/draft` | admin | AI draft (`?refresh=true` to regenerate) |
| GET | `/api/events` | any | SSE stream of `ticket.updated` |
| GET | `/api/health` | public | Liveness |

Admin queue filters: `status`, `category`, `priority`, `assigned` (`me`/`unassigned`), `from`, `to`, `q`, `limit`, `offset`. Ordering is unresolved first, then priority, then oldest.

Errors always look like `{ "error": { "message": "...", "details": [{ "field", "message" }] } }` with 400 (validation), 401, 403, 404, 429 as appropriate; unexpected errors return a generic 500 and are logged, never leaked.

## Assumptions

- The provided JSON is the source of truth for authors and books. Author emails become logins, with a shared demo password.
- "Published books" on My Books includes books still in production, clearly marked, so an author can also raise a query about them. MRP and royalties are shown only once published.
- The **₹ amounts in the seed are used as-is**; I did not recompute `total_royalty_earned`.
- Attachments are UI only, as the brief allows. The file picker is there and says plainly that upload is not enabled.
- "Next payout date" is derived from the KB rule (quarter end + 45 days) from today's date, not from any stored payout schedule.
- An author reply on a Resolved ticket re-opens it; a Closed ticket is final.
- Admin replies move an Open ticket to In Progress and assign it to the replier if nobody owns it.
- Tickets older than 48 hours and still unresolved are highlighted in the queue (a UI convention, not an SLA from the brief).

## Known limitations / next steps

- SSE hub and login rate limiting are in-memory (single instance). Redis would replace both.
- No password reset, no admin user management, no pagination UI beyond a "narrow your filters" note.
- Attachments are not stored.
- No email notifications to authors when a reply is sent.
- The draft prompt does not know payment history beyond the dataset fields (no bank-details-linked flag, no per-platform sales), so the model is told to say the team will verify those.
- Classification accuracy has only been checked on hand-written examples. With more time: a small labelled set and a script that scores category/priority accuracy per prompt change.
- Prompt caching of the static system prompt would trim cost further at higher volume.
