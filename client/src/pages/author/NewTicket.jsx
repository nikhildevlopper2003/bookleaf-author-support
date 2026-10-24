import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

export default function NewTicket() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [books, setBooks] = useState([]);
  const [form, setForm] = useState({ bookId: state?.bookId ?? '', subject: '', description: '' });
  const [fileName, setFileName] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.books().then((r) => setBooks(r.items)).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setBusy(true);
    try {
      await api.createTicket({ ...form, bookId: form.bookId || null });
      navigate('/tickets', { state: { justSubmitted: true } });
    } catch (err) {
      if (err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
      else setFormError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h2>Submit a support query</h2>
        <p className="muted">Tell us what is going on and our team will get back to you. You will see replies under My tickets.</p>
      </div>

      <form className="card form" onSubmit={submit} noValidate>
        <label>
          Which book is this about?
          <select value={form.bookId} onChange={set('bookId')}>
            <option value="">General / Account level</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </select>
        </label>

        <label>
          Subject
          <input value={form.subject} onChange={set('subject')} maxLength={150} placeholder="e.g. Royalty for Q3 not received" />
          {errors.subject && <span className="error small">{errors.subject}</span>}
        </label>

        <label>
          Describe the issue
          <textarea rows={7} value={form.description} onChange={set('description')} maxLength={5000}
            placeholder="Include dates, amounts or platform names if they are relevant." />
          {errors.description && <span className="error small">{errors.description}</span>}
        </label>

        <label>
          Attachment (optional)
          <input type="file" onChange={(e) => setFileName(e.target.files[0]?.name ?? '')} />
          <span className="muted small">
            {fileName
              ? `${fileName} selected. File upload is not enabled yet, so please mention it in the description or email it to the team.`
              : 'Screenshots or photos help for printing issues.'}
          </span>
        </label>

        {formError && <p className="error" role="alert">{formError}</p>}
        <div className="actions">
          <button className="primary" disabled={busy}>{busy ? 'Submitting...' : 'Submit query'}</button>
        </div>
      </form>
    </>
  );
}
