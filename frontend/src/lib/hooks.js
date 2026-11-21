import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/** GET helper with loading / error / reload. Re-fetches when path or params change. */
export function useApi(path, params, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const key = path + JSON.stringify(params ?? {});
  const seq = useRef(0);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!enabled) return;
      const mine = ++seq.current;
      if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await api.get(path, params);
        if (mine === seq.current) setState({ data, error: null, loading: false });
      } catch (error) {
        if (mine === seq.current) setState({ data: null, error, loading: false });
      }
    },
    // deps are intentionally keyed on the serialised params / route key
    [key, enabled],
  );

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: () => load({ silent: true }) };
}

/** Wraps an async action with a busy flag and error capture. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (fn) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, clearError: () => setError(null) };
}
