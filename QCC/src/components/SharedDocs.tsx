// Loads a page's shared documents from the server before the page mounts, then shows
// one small save-status line for them (Saving… / Saved / View only / changed on another
// PC). Pages inside read and write through sharedStore.get / sharedStore.set.
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Loader2, CheckCircle2, Eye, AlertTriangle, RefreshCw } from 'lucide-react';
import { sharedStore, type SaveStatus } from '../lib/sharedStore';
import { formatDateTime } from '../lib/format';

// Worst status first: what the user most needs to know about.
const ORDER: SaveStatus[] = ['conflict', 'error', 'saving', 'readonly', 'saved', 'idle'];

/** The combined save status of some keys (re-renders on every store change). */
export function useSharedStatus(keys: string[]) {
  const snapshot = useSyncExternalStore(sharedStore.subscribe, () =>
    keys.map(k => { const i = sharedStore.info(k); return `${i?.status}|${i?.updatedAt}|${i?.error}`; }).join(';'));
  void snapshot;
  const infos = keys.map(k => sharedStore.info(k)).filter(Boolean) as NonNullable<ReturnType<typeof sharedStore.info>>[];
  const worst = ORDER.find(s => infos.some(i => i.status === s)) || 'idle';
  const latest = infos.filter(i => i.updatedAt).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];
  return { status: worst, error: infos.find(i => i.status === worst)?.error, updatedAt: latest?.updatedAt, updatedByName: latest?.updatedByName };
}

export function SaveStatusLine({ keys, onReload }: { keys: string[]; onReload: () => void }) {
  const s = useSharedStatus(keys);
  const base = 'flex items-center justify-end gap-1.5 text-[11px] font-medium';
  if (s.status === 'conflict') return (
    <div className={`${base} text-amber-700`}><AlertTriangle size={13} /> {s.error || 'Changed on another PC.'}
      <button onClick={onReload} className="inline-flex items-center gap-1 ml-1 px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200"><RefreshCw size={11} /> Reload</button></div>);
  if (s.status === 'error') return <div className={`${base} text-red-600`}><AlertTriangle size={13} /> Not saved — {s.error} (it will retry on your next change)</div>;
  if (s.status === 'saving') return <div className={`${base} text-slate-500`}><Loader2 size={13} className="animate-spin" /> Saving…</div>;
  if (s.status === 'readonly') return <div className={`${base} text-slate-500`}><Eye size={13} /> View only — your changes here are not saved</div>;
  if (s.updatedAt) return <div className={`${base} text-emerald-600`}><CheckCircle2 size={13} /> Saved{s.updatedByName ? ` by ${s.updatedByName}` : ''} · {formatDateTime(s.updatedAt)}</div>;
  return null;
}

export default function SharedDocs({ keys, children, className = '' }: { keys: string[]; children: ReactNode; className?: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [round, setRound] = useState(0);   // bumps after a reload so the page re-reads the data
  const keyList = keys.join('|');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    sharedStore.load(keyList.split('|').filter(Boolean), { force: true })
      .then(() => { if (!cancelled) setState('ready'); })
      .catch(e => { if (!cancelled) { setError(e instanceof Error ? e.message : 'Could not load'); setState('error'); } });
    return () => { cancelled = true; };
  }, [keyList, round]);

  if (state === 'loading') return <div className="flex items-center gap-2 px-4 py-10 justify-center text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading saved data…</div>;
  if (state === 'error') return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
      <span>Could not load this data: {error}</span>
      <button onClick={() => setRound(r => r + 1)} className="inline-flex items-center gap-1 text-xs font-semibold underline"><RefreshCw size={12} /> Retry</button>
    </div>);
  return (
    <div className="space-y-2">
      <SaveStatusLine keys={keys} onReload={() => setRound(r => r + 1)} />
      <div key={round} className={className}>{children}</div>
    </div>
  );
}
