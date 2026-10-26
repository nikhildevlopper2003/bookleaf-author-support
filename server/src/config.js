import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProd = process.env.NODE_ENV === 'production';

const secretFromEnv = process.env.JWT_SECRET && process.env.JWT_SECRET !== 'change-me';
if (isProd && !secretFromEnv) throw new Error('JWT_SECRET must be set in production');

export const config = {
  root,
  isProd,
  port: Number(process.env.PORT) || 4000,
  // in dev a throwaway secret is fine; sessions just end when the server restarts
  jwtSecret: secretFromEnv ? process.env.JWT_SECRET : crypto.randomBytes(32).toString('hex'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  dbPath: path.resolve(root, process.env.DATABASE_PATH || './data/bookleaf.db'),
  seedFile: path.join(root, 'data', 'bookleaf_sample_data.json'),
  seedAuthorPassword: process.env.SEED_AUTHOR_PASSWORD || 'author123',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'admin123',
  clientDist: path.resolve(root, '..', 'client', 'dist'),
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.AI_MODEL || 'claude-haiku-5-5',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 15000,
  },
};
