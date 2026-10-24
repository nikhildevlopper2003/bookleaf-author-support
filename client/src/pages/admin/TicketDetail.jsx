import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { PriorityBadge, StatusBadge } from '../../components/Badges.jsx';
import Thread from '../../components/Thread.jsx';
import { CATEGORIES, PRIORITIES, STATUSES, formatDateTime } from '../../format.js';
import { useAuth } from '../../auth.jsx';
import { useLive } from '../../useLive.js';

const SOURCE_LABEL = { ai: 'set by AI', fallback: 'set by keyword rules (AI unavailable)', admin: 'set by an admin' };

function Composer({ ticket, onSent }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [draftState, setDraftState] = useState({ phase: 'loading' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);

  const loadDraft = useCallback(
    async (refresh = false) => {
      if (refresh && touched.current && !window.confirm('Replace what you have typed with a new AI draft?')) return;
      setDraftState({ phase: 'loading' });
      try {
        const r = await api.draft(ticket.id, refresh);
        if (r.pending) return setDraftState({ phase: 'pending' });
        if (!r.aiAvailable) return setDraftState({ phase: 'unavailable' });
        setDraftState({ phase: 'ready' });
        // never overwrite text the admin has already started writing
        if (!touched.current || refresh) {
          setText(r.draft);
          touched.current = false;
        }
      } catch (err) {
        setDraftState({ phase: 'unavailable', message: err.message });
      }
    },
    [ticket.id]
  );

  // Generate when the ticket is opened, and again once triage finishes or the author replies.
  const lastAuthorMsg = ticket.messages.filter((m) => m.senderRole === 'author').at(-1)?.id;
  useEffect(() => {
    if (ticket.category) loadDraft(false);
    else setDraftState({ phase: 'pending' });
  }, [ticket.category, lastAuthorMsg, loadDraft]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.postMessage(ticket.id, { body: text, ...(status && { status }) });
      setText('');
      setStatus('');
      touched.current = false;
      onSent();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="composer" onSubmit={send}>
      <div className="composer-head">
        <h4>Reply to author</h4>
        {draftState.phase === 'ready' && <span className="tag ai">AI draft - review before sending</span>}
        <button type="button" className="link" onClick={() => loadDraft(true)} disabled={draftState.phase === 'loading'}>
          Regenerate draft
        </button>
      </div>

      {draftState.phase === 'loading' && <p className="muted small">Drafting a reply from the knowledge base...</p>}
      {draftState.phase === 'pending' && <p className="muted small">Waiting for triage before drafting...</p>}
      {draftState.phase === 'unavailable' && (
        <p className="notice">AI drafting is unavailable right now. You can write the reply manually below.</p>
      )}

      <textarea
        rows={10}
        value={text}
        onChange={(e) => {
          touched.current = true;
          setText(e.target.value);
        }}
        placeholder="Write a reply..."
      />
      {error && <p className="error small">{error}</p>}
      <div className="actions">
        <label className="inline">
          Then set status to
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{ticket.status === 'Open' ? 'In Progress (default)' : 'Keep current'}</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <button className="primary" disabled={busy || !text.trim()}>Send reply</button>
      </div>
    </form>
  );
}

function Notes({ ticket, onAdded }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.addNote(ticket.id, body);
      setBody('');
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="side-block">
      <h4>Internal notes <span className="muted small">(never shown to the author)</span></h4>
      {ticket.notes.length === 0 && <p className="muted small">No notes yet.</p>}
      <ul className="notes">
        {ticket.notes.map((n) => (
          <li key={n.id}>
            <p>{n.body}</p>
            <span className="muted small">{n.adminName} · {formatDateTime(n.createdAt)}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={add}>
        <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note for the team" />
        <button disabled={busy || !body.trim()}>Add note</button>
      </form>
    </section>
  );
}

export default function TicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.ticket(id).then((r) => setTicket(r.ticket)).catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);
  useLive(load);

  const update = async (patch) => {
    try {
      const r = await api.updateTicket(id, patch);
      setTicket(r.ticket);
    } catch (err) {
      setError(err.message);
    }
  };

  if (error && !ticket) return <p className="error">{error}</p>;
  if (!ticket) return <p className="muted">Loading ticket...</p>;

  const mine = ticket.assignedTo?.id === user.id;

  return (
    <>
      <p className="small"><Link to="/admin">← Back to queue</Link></p>
      <div className="page-head">
        <h2>{ticket.subject}</h2>
        <p className="muted">
          #{ticket.id} · {ticket.author.name} · {ticket.book ? ticket.book.title : 'General / Account level'} · Opened {formatDateTime(ticket.createdAt)}
        </p>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="detail">
        <div className="main">
          <div className="card">
            <Thread messages={ticket.messages} viewer="admin" />
          </div>
          {ticket.status === 'Closed' ? (
            <p className="notice">This ticket is closed. Change its status to reply again.</p>
          ) : (
            <div className="card">
              <Composer ticket={ticket} onSent={load} />
            </div>
          )}
        </div>

        <aside className="side">
          <section className="side-block">
            <h4>Triage</h4>
            <label>
              Status
              <select value={ticket.status} onChange={(e) => update({ status: e.target.value })}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>
              Category
              <select value={ticket.category ?? ''} onChange={(e) => update({ category: e.target.value })}>
                {!ticket.category && <option value="">Classifying...</option>}
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              {ticket.categorySource && <span className="muted small">{SOURCE_LABEL[ticket.categorySource]}</span>}
            </label>
            <label>
              Priority <PriorityBadge priority={ticket.priority} />
              <select value={ticket.priority ?? ''} onChange={(e) => update({ priority: e.target.value })}>
                {!ticket.priority && <option value="">Scoring...</option>}
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
              {ticket.prioritySource && <span className="muted small">{SOURCE_LABEL[ticket.prioritySource]}</span>}
            </label>
            {ticket.aiReasoning && ticket.categorySource !== 'admin' && <p className="muted small">Why: {ticket.aiReasoning}</p>}
          </section>

          <section className="side-block">
            <h4>Assignment</h4>
            <p>{ticket.assignedTo ? ticket.assignedTo.name : <span className="muted">Unassigned</span>}</p>
            {mine ? (
              <button onClick={() => update({ assignee: 'none' })}>Unassign me</button>
            ) : (
              <button onClick={() => update({ assignee: 'me' })}>Assign to me</button>
            )}
          </section>

          <Notes ticket={ticket} onAdded={load} />
        </aside>
      </div>
    </>
  );
}
