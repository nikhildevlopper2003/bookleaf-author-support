// Tiny in-memory SSE hub. One process only; swap for Redis pub/sub if we scale out.
const clients = new Set();

export function addClient(res, user) {
  const client = { res, user };
  clients.add(client);
  return () => clients.delete(client);
}

/** Notify the ticket's author and every admin. Payload is just a pointer; clients refetch. */
export function publishTicketEvent(type, ticket) {
  const payload = `event: ${type}\ndata: ${JSON.stringify({ ticketId: ticket.id })}\n\n`;
  for (const { res, user } of clients) {
    if (user.role === 'admin' || user.authorId === ticket.author_id) res.write(payload);
  }
}
