import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const FlashContext = createContext(null);
export const useFlash = () => useContext(FlashContext);

/** Session-flash replacement: navigate(path, { state: { flash: 'Saved.' } }) or flash.success('Saved.') */
export function FlashProvider({ children }) {
  const [flash, setFlash] = useState(null);
  const success = useCallback((message) => setFlash({ type: 'success', message }), []);
  const clear = useCallback(() => setFlash(null), []);
  const value = useMemo(() => ({ flash, success, clear }), [flash, success, clear]);
  return <FlashContext.Provider value={value}>{children}</FlashContext.Provider>;
}
