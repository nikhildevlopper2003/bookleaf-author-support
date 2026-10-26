import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { formatDate, rupees } from '../../format.js';

function Stat({ label, value, tone }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BookCard({ book }) {
  const live = book.isPublished;
  return (
    <article className="card book">
      <header>
        <div>
          <h3>{book.title}</h3>
          <p className="muted small">{book.genre} · ISBN {book.isbn}</p>
        </div>
        <span className={`badge ${live ? 'status-resolved' : 'status-in-progress'}`}>{book.status}</span>
      </header>

      {live ? (
        <>
          <div className="stats">
            <Stat label="MRP" value={rupees(book.mrp)} />
            <Stat label="Copies sold" value={book.copiesSold.toLocaleString('en-IN')} />
            <Stat label="Royalty earned" value={rupees(book.royaltyEarned)} />
            <Stat label="Royalty paid" value={rupees(book.royaltyPaid)} />
            <Stat label="Royalty pending" value={rupees(book.royaltyPending)} tone={book.royaltyPending > 0 ? 'warn' : ''} />
          </div>
          {book.royaltyPending > 0 && book.royaltyPending < 1000 && (
            <p className="notice">
              Pending royalty is below the ₹1,000 minimum payout, so it rolls over to the next quarter.
            </p>
          )}
          <p className="muted small">
            Published {formatDate(book.publicationDate)} · Last payout {book.lastPayoutDate ? formatDate(book.lastPayoutDate) : 'none yet'} ·
            Available on {book.availableOn.join(', ')}
          </p>
        </>
      ) : (
        <p className="notice">
          This book is still in production ({book.status.replace('In Production - ', '')}). Pricing, sales and royalties
          will appear here once it is published.
        </p>
      )}

      <footer>
        <Link to="/tickets/new" state={{ bookId: book.id }}>Ask about this book</Link>
      </footer>
    </article>
  );
}

export default function Books() {
  const [books, setBooks] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.books().then((r) => setBooks(r.items)).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!books) return <p className="muted">Loading your books...</p>;
  if (!books.length) return <p className="card empty">No books are linked to your account yet.</p>;

  const pending = books.reduce((sum, b) => sum + b.royaltyPending, 0);

  return (
    <>
      <div className="page-head">
        <h2>My books</h2>
        <p className="muted">
          {books.length} {books.length === 1 ? 'book' : 'books'} · Total royalty pending {rupees(pending)}
        </p>
      </div>
      <div className="stack">
        {books.map((b) => <BookCard key={b.id} book={b} />)}
      </div>
    </>
  );
}
