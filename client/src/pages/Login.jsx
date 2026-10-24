import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const DEMO = [
  { label: 'Author: Priya Sharma', email: 'priya.sharma@email.com', password: 'author123' },
  { label: 'Author: Sneha Kulkarni', email: 'sneha.kulkarni@email.com', password: 'author123' },
  { label: 'Admin', email: 'admin@bookleaf.example', password: 'admin123' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(form.email, form.password);
      navigate(user.role === 'admin' ? '/admin' : '/books', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h1>BookLeaf</h1>
        <p className="muted">Sign in to the author support portal</p>

        <label>
          Email
          <input type="email" value={form.email} onChange={set('email')} autoComplete="username" required autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={form.password} onChange={set('password')} autoComplete="current-password" required />
        </label>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>

        <div className="demo">
          <p className="muted small">Demo accounts (click to fill)</p>
          {DEMO.map((d) => (
            <button type="button" key={d.email} className="link" onClick={() => setForm({ email: d.email, password: d.password })}>
              {d.label}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
