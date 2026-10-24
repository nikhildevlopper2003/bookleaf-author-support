import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import bookRoutes from './routes/books.js';
import ticketRoutes from './routes/tickets.js';
import eventRoutes from './routes/events.js';
import { aiConfigured } from './ai/client.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.isProd ? false : true }));
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();
  api.get('/health', (_req, res) =>
    res.json({ status: 'ok', ai: aiConfigured() ? 'configured' : 'fallback-only' })
  );
  api.use('/auth', authRoutes);
  // everything below this line requires a valid token
  api.use(authenticate);
  api.use('/books', bookRoutes);
  api.use('/tickets', ticketRoutes);
  api.use('/events', eventRoutes);
  api.use(notFoundHandler);
  app.use('/api', api);

  // In production the built React app is served from the same origin.
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
