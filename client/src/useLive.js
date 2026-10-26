import { useEffect, useRef } from 'react';
import { tokenStore } from './api.js';

// Calls `reload` when the server reports a ticket change (SSE). The slow poll covers dropped streams.
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
