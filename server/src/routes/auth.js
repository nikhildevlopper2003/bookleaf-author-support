import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/index.js';
import { validate } from '../middleware/validate.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { HttpError, unauthorized } from '../errors.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Minimal brute-force guard: 10 failures per ip+email per 15 minutes. In-memory, resets on restart.
const failures = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

function checkLimit(key) {
  const now = Date.now();
  const recent = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, recent);
  if (recent.length >= MAX_FAILURES) {
    throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.');
  }
}

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

router.post('/login', validate(loginSchema), (req, res, next) => {
  try {
    const { email, password } = req.body;
    const key = `${req.ip}:${email}`;
    checkLimit(key);

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const ok = bcrypt.compareSync(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) {
      failures.get(key).push(Date.now());
      throw unauthorized('Incorrect email or password');
    }

    failures.delete(key);
    res.json({
      token: signToken(user),
      user: { id: user.id, name: user.name, email: user.email, role: user.role, authorId: user.author_id },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;
