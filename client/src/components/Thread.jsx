import { formatDateTime } from '../format.js';

/** Conversation on a ticket. `viewer` decides which side is "you". */
export default function Thread({ messages, viewer }) {
  return (
    <ul className="thread">
      {messages.map((m) => {
        const mine = m.senderRole === viewer;
        return (
          <li key={m.id} className={`msg ${mine ? 'mine' : 'theirs'} ${m.senderRole}`}>
            <div className="msg-head">
              <strong>{m.senderRole === 'admin' ? `${m.senderName} (BookLeaf)` : m.senderName}</strong>
              <time>{formatDateTime(m.createdAt)}</time>
            </div>
            <p>{m.body}</p>
          </li>
        );
      })}
    </ul>
  );
}
