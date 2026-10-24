export const CATEGORIES = [
  'Royalty & Payments',
  'ISBN & Metadata Issues',
  'Printing & Quality',
  'Distribution & Availability',
  'Book Status & Production Updates',
  'General Inquiry',
];
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
export const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];

export const rupees = (n) => (n == null ? '-' : `₹${Number(n).toLocaleString('en-IN')}`);

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

export const formatDateTime = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** "3d", "5h", "12m" since the timestamp. */
export function ageOf(iso) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

export const isUnresolved = (status) => status === 'Open' || status === 'In Progress';

export const isStale = (t) => isUnresolved(t.status) && Date.now() - new Date(t.createdAt).getTime() > 48 * 3600 * 1000;
