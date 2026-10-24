import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { CATEGORIES, PRIORITIES, STATUSES } from '../ai/constants.js';
import * as tickets from '../services/ticketService.js';

const router = Router();
const adminOnly = requireRole('admin');
const authorOnly = requireRole('author');

const idParams = z.object({ id: z.coerce.number().int().positive() });

const text = (field, min, max) =>
  z
    .string({ error: `${field} is required` })
    .trim()
    .min(min, `${field} must be at least ${min} characters`)
    .max(max, `${field} must be at most ${max} characters`);

const createSchema = z.object({
  bookId: z.string().trim().nullish().transform((v) => v || null),
  subject: text('Subject', 3, 150),
  description: text('Description', 10, 5000),
});

const messageSchema = z.object({
  body: text('Message', 1, 5000),
  status: z.enum(STATUSES).optional(),
});

const patchSchema = z
  .object({
    status: z.enum(STATUSES),
    category: z.enum(CATEGORIES),
    priority: z.enum(PRIORITIES),
    assignee: z.enum(['me', 'none']).transform((v) => (v === 'me' ? 'me' : null)),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

const noteSchema = z.object({ body: text('Note', 1, 2000) });

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const listSchema = z.object({
  status: z.enum(STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  assigned: z.enum(['me', 'unassigned']).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const draftQuery = z.object({ refresh: z.enum(['true', 'false']).default('false') });

// Authors see their own tickets; admins see the whole queue (filterable).
router.get('/', validate(listSchema, 'query'), (req, res) => {
  if (req.user.role === 'author') {
    return res.json({ items: tickets.listAuthorTickets(req.user.authorId) });
  }
  res.json(tickets.listAdminTickets(req.user, req.query));
});

router.post('/', authorOnly, validate(createSchema), (req, res) => {
  const { ticket } = tickets.createTicket(req.user, req.body);
  res.status(201).json({ ticket });
});

router.get('/:id', validate(idParams, 'params'), (req, res) => {
  const { id } = req.params;
  const ticket =
    req.user.role === 'admin' ? tickets.getAdminTicket(id) : tickets.getAuthorTicket(req.user, id);
  res.json({ ticket });
});

router.patch('/:id', adminOnly, validate(idParams, 'params'), validate(patchSchema), (req, res) => {
  res.json({ ticket: tickets.updateTicket(req.user, req.params.id, req.body) });
});

// Both roles post into the thread; the optional status only applies to admin replies.
router.post('/:id/messages', validate(idParams, 'params'), validate(messageSchema), (req, res) => {
  const { id } = req.params;
  const ticket =
    req.user.role === 'admin'
      ? tickets.adminReply(req.user, id, req.body)
      : tickets.addAuthorMessage(req.user, id, req.body.body);
  res.status(201).json({ ticket });
});

router.post('/:id/notes', adminOnly, validate(idParams, 'params'), validate(noteSchema), (req, res) => {
  res.status(201).json({ ticket: tickets.addNote(req.user, req.params.id, req.body.body) });
});

router.get(
  '/:id/draft',
  adminOnly,
  validate(idParams, 'params'),
  validate(draftQuery, 'query'),
  async (req, res, next) => {
    try {
      res.json(await tickets.getDraft(req.params.id, { refresh: req.query.refresh === 'true' }));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
