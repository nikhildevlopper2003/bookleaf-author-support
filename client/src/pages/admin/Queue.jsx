import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { PriorityBadge, StatusBadge } from '../../components/Badges.jsx';
import { CATEGORIES, PRIORITIES, STATUSES, ageOf, isStale, isUnresolved } from '../../format.js';
import { useLive } from '../../useLive.js';

const EMPTY = { status: '', category: '', priority: '', assigned: '', from: '', to: '', q: '' };

function Select({ label, value, onChange, options }) {
  return (
    <label>
      {label}
      <select value={value} onChange={onChange}>
        <option value="">All</option>
        {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o}>{o}</option>))}
      </select>
    </label>
  );
}

export default function Queue() {
  const [filters, setFilters] = useState(EMPTY);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.tickets(filters).then(setData).catch((e) => setError(e.message));
  }, [filters]);

  useEffect(load, [load]);
  useLive(load);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const filtered = Object.values(filters).some(Boolean);

  const open = data?.items.filter((t) => isUnresolved(t.status)).length ?? 0;
  const critical = data?.items.filter((t) => isUnresolved(t.status) && t.priority === 'Critical').length ?? 0;

  return (
    <>
      <div className="page-head">
        <h2>Ticket queue</h2>
        <p className="muted">
          Unresolved tickets first, most urgent then oldest.
          {data && ` ${open} unresolved${critical ? `, ${critical} critical` : ''} in this view.`}
        </p>
      </div>

      <div className="card filters">
        <label className="grow">
          Search
          <input value={filters.q} onChange={set('q')} placeholder="Subject, author or text" />
        </label>
        <Select label="Status" value={filters.status} onChange={set('status')} options={STATUSES} />
        <Select label="Category" value={filters.category} onChange={set('category')} options={CATEGORIES} />
        <Select label="Priority" value={filters.priority} onChange={set('priority')} options={PRIORITIES} />
        <Select label="Assigned" value={filters.assigned} onChange={set('assigned')} options={[['me', 'Me'], ['unassigned', 'Unassigned']]} />
        <label>
          From
          <input type="date" value={filters.from} onChange={set('from')} />
        </label>
        <label>
          To
          <input type="date" value={filters.to} onChange={set('to')} />
        </label>
        {filtered && <button className="link" onClick={() => setFilters(EMPTY)}>Clear</button>}
      </div>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Loading tickets...</p>}

      {data && !data.items.length && (
        <div className="card empty">
          <p>{filtered ? 'No tickets match these filters.' : 'No tickets yet. New author queries will show up here.'}</p>
        </div>
      )}

      {data?.items.length > 0 && (
        <div className="card table-wrap">
          <table className="queue">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Ticket</th>
                <th>Author</th>
                <th>Category</th>
                <th>Status</th>
                <th>Assigned</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((t) => (
                <tr key={t.id} className={isStale(t) ? 'stale' : ''}>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td>
                    <Link to={`/admin/tickets/${t.id}`}>{t.subject}</Link>
                    <div className="muted small">#{t.id}{t.book ? ` · ${t.book.title}` : ''}</div>
                  </td>
                  <td>{t.author.name}</td>
                  <td>{t.category ?? <span className="muted">Classifying...</span>}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>{t.assignedTo?.name ?? <span className="muted">-</span>}</td>
                  <td title={isStale(t) ? 'Unresolved for more than 48 hours' : ''}>{ageOf(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.total > data.items.length && (
            <p className="muted small pad">Showing {data.items.length} of {data.total}. Narrow the filters to see the rest.</p>
          )}
        </div>
      )}
    </>
  );
}
