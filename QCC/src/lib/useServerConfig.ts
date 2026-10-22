// For app-wide config providers (Activity Steps, Dept Hierarchy, Meeting Schedules,
// QCC periods): pull the shared copy from the server once signed in and again whenever
// the window regains focus, so an Admin's change on one PC reaches every other PC.
// The provider keeps its localStorage copy only as a fast first paint / offline cache.
import { useEffect, useRef } from 'react';
import { useAuth } from './auth';
import { sharedStore } from './sharedStore';

export function useServerConfig(key: string, apply: (data: unknown) => void): void {
  const { user } = useAuth();
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const pull = () => sharedStore.load([key], { force: true })
      .then(() => { if (cancelled) return; const data = sharedStore.get(key); if (data != null) applyRef.current(data); })
      .catch(() => { /* offline: keep the cached copy */ });
    pull();
    window.addEventListener('focus', pull);
    return () => { cancelled = true; window.removeEventListener('focus', pull); };
  }, [key, userId]);
}
