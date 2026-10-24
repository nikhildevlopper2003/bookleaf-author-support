import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { validate } from '../middleware/validate.js';
import { notFound } from '../errors.js';

const router = Router();

const toBook = (b) => ({
  id: b.id,
  authorId: b.author_id,
  title: b.title,
  isbn: b.isbn,
  genre: b.genre,
  publicationDate: b.publication_date,
  status: b.status,
  isPublished: b.status === 'Published & Live',
  mrp: b.mrp,
  royaltyPerCopy: b.royalty_per_copy,
  copiesSold: b.copies_sold,
  royaltyEarned: b.royalty_earned,
  royaltyPaid: b.royalty_paid,
  royaltyPending: b.royalty_pending,
  lastPayoutDate: b.last_payout_date,
  printPartner: b.print_partner,
  availableOn: JSON.parse(b.available_on),
});

const listQuery = z.object({ authorId: z.string().optional() });

// Authors always get their own books; the authorId filter only applies to admins.
router.get('/', validate(listQuery, 'query'), (req, res) => {
  const { user } = req;
  const authorId = user.role === 'author' ? user.authorId : req.query.authorId;
  const rows = authorId
    ? db.prepare('SELECT * FROM books WHERE author_id = ? ORDER BY id').all(authorId)
    : db.prepare('SELECT * FROM books ORDER BY id').all();
  res.json({ items: rows.map(toBook) });
});

router.get('/:id', (req, res, next) => {
  const row = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
  // same 404 whether the book does not exist or belongs to someone else
  if (!row || (req.user.role === 'author' && row.author_id !== req.user.authorId)) {
    return next(notFound('Book not found'));
  }
  res.json({ book: toBook(row) });
});

export default router;
