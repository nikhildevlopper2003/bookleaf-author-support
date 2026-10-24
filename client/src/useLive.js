import { useEffect, useRef } from 'react';
import { tokenStore } from './api.js';

/**
 * Calls `reload` whenever the server says a ticket changed (Server-Sent Events).
 * EventSource reconnects on its own; a slow poll covers proxies that drop the stream.
 */
export function useLive(reload) {
  const latest = useRef(reload);
  latest.current = reload;

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;

    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    es.addEventListener('ticket.updated', () => latest.current());
    const poll = setInterval(() => latest.current(), 60000);

    return () => {
      es.close();
      clearInterval(poll);
    };
  }, []);
}
