import { Router } from 'express';
import { addClient } from '../services/events.js';

const router = Router();

// Server-Sent Events: clients get a pointer ("ticket 12 changed") and refetch through the REST API.
router.get('/', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  const remove = addClient(res, req.user);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    remove();
  });
});

export default router;
