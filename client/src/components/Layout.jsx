import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  if (!user) return <Outlet />;

  const links =
    user.role === 'admin'
      ? [['/admin', 'Ticket queue']]
      : [
          ['/books', 'My books'],
          ['/tickets/new', 'Submit a query'],
          ['/tickets', 'My tickets'],
        ];

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">BookLeaf <small>{user.role === 'admin' ? 'Support Desk' : 'Author Portal'}</small></span>
          <nav>
            {links.map(([to, label]) => (
              <NavLink key={to} to={to} end>{label}</NavLink>
            ))}
          </nav>
          <div className="who">
            <span>{user.name}</span>
            <button className="link" onClick={logout}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
