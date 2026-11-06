import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ErrorText } from '../components/ui.jsx';

export default function AuthPage({ mode }) {
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const isSignup = mode === 'signup';

  if (user) return <Navigate to="/" replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      if (isSignup) await signup(form.name, form.email, form.password);
      else await login(form.email, form.password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="auth-wrap">
    <form className="card auth" onSubmit={submit}>
      <span className="brand"><span className="brand-mark">🎓</span>App Tracker</span>
      <h1>{isSignup ? 'Create your account' : 'Sign in'}</h1>
      {isSignup && (
        <label>
          Name
          <input value={form.name} onChange={set('name')} required />
        </label>
      )}
      <label>
        Email
        <input type="email" value={form.email} onChange={set('email')} required />
      </label>
      <label>
        Password
        <input type="password" value={form.password} onChange={set('password')} minLength={isSignup ? 8 : undefined} required />
      </label>
      <ErrorText error={error} />
      <button type="submit">{isSignup ? 'Sign up' : 'Sign in'}</button>
      <p className="muted">
        {isSignup ? <>Have an account? <Link to="/login">Sign in</Link></> : <>New here? <Link to="/signup">Create an account</Link></>}
      </p>
    </form>
    </div>
  );
}
