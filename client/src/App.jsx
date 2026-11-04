import { NavLink, Route, Routes } from 'react-router-dom';
import { RequireAuth, useAuth } from './auth.jsx';
import AuthPage from './pages/AuthPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Colleges from './pages/Colleges.jsx';
import CollegeDetail from './pages/CollegeDetail.jsx';
import Essays from './pages/Essays.jsx';
import EssayEditor from './pages/EssayEditor.jsx';
import Tags from './pages/Tags.jsx';

function Nav() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <header className="nav">
      <strong className="brand">🎓 App Tracker</strong>
      <NavLink to="/" end>Dashboard</NavLink>
      <NavLink to="/colleges">Colleges</NavLink>
      <NavLink to="/essays">Essays</NavLink>
      <NavLink to="/tags">Tags</NavLink>
      <span className="spacer" />
      <span className="muted">{user.name}</span>
      <button className="link" onClick={logout}>Log out</button>
    </header>
  );
}

const guard = (el) => <RequireAuth>{el}</RequireAuth>;

export default function App() {
  return (
    <>
      <Nav />
      <main>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/" element={guard(<Dashboard />)} />
          <Route path="/colleges" element={guard(<Colleges />)} />
          <Route path="/colleges/:id" element={guard(<CollegeDetail />)} />
          <Route path="/essays" element={guard(<Essays />)} />
          <Route path="/essays/:id" element={guard(<EssayEditor />)} />
          <Route path="/tags" element={guard(<Tags />)} />
          <Route path="*" element={<p className="pad">Page not found.</p>} />
        </Routes>
      </main>
    </>
  );
}
