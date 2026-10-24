import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Books from './pages/author/Books.jsx';
import NewTicket from './pages/author/NewTicket.jsx';
import MyTickets from './pages/author/MyTickets.jsx';
import Queue from './pages/admin/Queue.jsx';
import TicketDetail from './pages/admin/TicketDetail.jsx';

const home = (user) => (user.role === 'admin' ? '/admin' : '/books');

function Protected({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="center muted">Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={home(user)} replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={home(user)} replace /> : <Login />} />

      <Route element={<Layout />}>
        <Route path="/books" element={<Protected role="author"><Books /></Protected>} />
        <Route path="/tickets/new" element={<Protected role="author"><NewTicket /></Protected>} />
        <Route path="/tickets" element={<Protected role="author"><MyTickets /></Protected>} />

        <Route path="/admin" element={<Protected role="admin"><Queue /></Protected>} />
        <Route path="/admin/tickets/:id" element={<Protected role="admin"><TicketDetail /></Protected>} />
      </Route>

      <Route
        path="*"
        element={loading ? null : <Navigate to={user ? home(user) : '/login'} replace />}
      />
    </Routes>
  );
}
