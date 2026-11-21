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

  // Public employee self-registration. It does NOT sign in: the employee logs in afterwards.
  const register = useCallback((form) => api.post('/auth/register', form), []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* already signed out */ }
    setState({ user: null, badges: {}, ready: true, signedOut: true }); // explicit sign-out (vs. an expired session)
  }, []);

  const value = useMemo(() => {
    const roles = state.user?.roles ?? [];
    const perms = state.user?.permissions ?? [];
    // Employees (and only employees) must finish their profile before using the rest of the app.
    const needsProfile = Boolean(state.user) && roles.length > 0 && roles.every((r) => r === 'employee') && !state.user.profile_complete;
    return {
      ...state,
      needsProfile,
      login,
      register,
      logout,
      refresh,
      roles,
      hasRole: (...slugs) => slugs.some((s) => roles.includes(s)),
      // super_admin shortcut - full access (same rule as the API)
      hasPermission: (slug) => roles.includes('super_admin') || perms.includes(slug),
    };
  }, [state, login, register, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
