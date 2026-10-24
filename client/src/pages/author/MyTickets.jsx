import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../api.js';
import { StatusBadge } from '../../components/Badges.jsx';
import Thread from '../../components/Thread.jsx';
import { formatDateTime } from '../../format.js';
import { useLive } from '../../useLive.js';

function Reply({ ticket, onSent }) {
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.postMessage(ticket.id, { body });
      setBody('');
      onSent();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (ticket.status === 'Closed') return <p className="muted small">This ticket is closed. Submit a new query if you need more help.</p>;

  return (
    <form className="reply" onSubmit={send}>
      <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a reply..." />
      {error && <p className="error small">{error}</p>}
      <button className="primary" disabled={busy || !body.trim()}>Send reply</button>
    </form>
  );
}

function TicketItem({ ticket, onSent, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const adminReplies = ticket.messages.filter((m) => m.senderRole === 'admin').length;

  return (
    <article className="card ticket">
      <button className="ticket-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div>
          <h3>{ticket.subject}</h3>
          <p className="muted small">
            #{ticket.id} · {ticket.book ? ticket.book.title : 'General / Account level'} · Updated {formatDateTime(ticket.updatedAt)}
          </p>
        </div>
        <div className="right">
          {adminReplies > 0 && <span className="muted small">{adminReplies} {adminReplies === 1 ? 'reply' : 'replies'}</span>}
          <StatusBadge status={ticket.status} />
        </div>
      </button>

      {open && (
        <div className="ticket-body">
          <Thread messages={ticket.messages} viewer="author" />
          {adminReplies === 0 && (
            <p className="notice">We have your query. Our team usually responds within 48 hours.</p>
          )}
          <Reply ticket={ticket} onSent={onSent} />
        </div>
      )}
    </article>
  );
}

export default function MyTickets() {
  const { state } = useLocation();
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.tickets().then((r) => setTickets(r.items)).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);
  useLive(load);

  if (error) return <p className="error">{error}</p>;
  if (!tickets) return <p className="muted">Loading your tickets...</p>;

  return (
    <>
      <div className="page-head row">
        <h2>My tickets</h2>
        <Link className="button primary" to="/tickets/new">New query</Link>
      </div>

      {state?.justSubmitted && <p className="notice success">Your query has been submitted. We will reply here.</p>}

      {!tickets.length ? (
        <div className="card empty">
          <p>You have not raised any queries yet.</p>
          <Link to="/tickets/new">Submit your first query</Link>
        </div>
      ) : (
        <div className="stack">
          {tickets.map((t, i) => (
            <TicketItem key={t.id} ticket={t} onSent={load} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </>
  );
}
