import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { unauthorized, forbidden } from '../errors.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/** Resolve the user from a bearer token (or ?token= for EventSource, which cannot set headers). */
export function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return next(unauthorized());

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(unauthorized('Session expired or invalid, please sign in again'));
  }

  const user = db
    .prepare('SELECT id, email, name, role, author_id AS authorId FROM users WHERE id = ?')
    .get(payload.sub);
  if (!user) return next(unauthorized('Account no longer exists'));

  req.user = user;
  next();
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(forbidden());
