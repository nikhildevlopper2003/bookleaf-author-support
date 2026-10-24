const slug = (s) => s.toLowerCase().replace(/\s+/g, '-');

export const StatusBadge = ({ status }) => <span className={`badge status-${slug(status)}`}>{status}</span>;

export const PriorityBadge = ({ priority }) =>
  priority ? <span className={`badge prio-${slug(priority)}`}>{priority}</span> : <span className="badge pending">Triaging...</span>;
