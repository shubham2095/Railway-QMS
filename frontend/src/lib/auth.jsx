import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, badges: {}, ready: false });

  const refresh = useCallback(async () => {
    try {
      const d = await api.get('/auth/me');
      setState({ user: d.user, badges: d.badges, ready: true });
    } catch {
      setState({ user: null, badges: {}, ready: true });
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setState((s) => ({ ...s, user: null })));
    refresh();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const d = await api.post('/auth/login', { email, password });
    setState({ user: d.user, badges: d.badges, ready: true });
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* already signed out */ }
    setState({ user: null, badges: {}, ready: true });
  }, []);

  const value = useMemo(() => {
    const roles = state.user?.roles ?? [];
    const perms = state.user?.permissions ?? [];
    return {
      ...state,
      login,
      logout,
      refresh,
      roles,
      hasRole: (...slugs) => slugs.some((s) => roles.includes(s)),
      // super_admin shortcut - full access (same rule as the API)
      hasPermission: (slug) => roles.includes('super_admin') || perms.includes(slug),
    };
  }, [state, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
