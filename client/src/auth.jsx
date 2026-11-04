import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still checking, null = signed out

  useEffect(() => {
    api.me().then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  const value = {
    user,
    login: async (email, password) => setUser((await api.login(email, password)).user),
    signup: async (name, email, password) => setUser((await api.signup(name, email, password)).user),
    logout: async () => {
      await api.logout();
      setUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Wrap routes that need a signed-in user. */
export function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <p className="muted pad">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}
