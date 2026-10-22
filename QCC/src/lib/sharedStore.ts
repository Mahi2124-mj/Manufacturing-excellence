// ─── Shared store: server-backed replacement for localStorage ──────────────
// Step sheets, meeting minutes, evaluation, assessment and admin config used to live
// only in each browser's localStorage, so every PC saw different data. They now live
// on the backend (/api/docs) and this module keeps the familiar synchronous shape:
//
//   await sharedStore.load(keys)   fetch the keys once (the <SharedDocs> gate does this
//                                  before a page mounts)
//   sharedStore.get(key)           the loaded value (already parsed JSON) or null
//   sharedStore.set(key, value)    update it; saved to the server shortly after
//
// Every save names the version it was based on, so if another PC saved first the
// server answers 409 and the key turns "conflict" instead of overwriting their work.
//
// One-time move: when a key has nothing on the server yet but this browser still holds
// it under its old localStorage name, that copy is uploaded (if the user may edit it).
// The old localStorage entry is left in place as a backup.
import { api, ApiError, type SharedDoc } from './api';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict' | 'readonly';

interface Entry {
  data: unknown;
  version: number;
  canEdit: boolean;
  status: SaveStatus;
  error?: string;
  updatedAt?: string;
  updatedByName?: string;
  timer?: ReturnType<typeof setTimeout>;
  saving?: boolean;
  dirty?: boolean;      // changed since the last save started
}

const SAVE_DELAY_MS = 700;
const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();   // key -> the fetch loading it right now
let generation = 0;                                  // bumped by clear(); late answers are dropped
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());

// New key → the localStorage name the same data had before it moved to the server.
export function legacyKeyFor(key: string): string | null {
  const [kind, a = '', b = ''] = key.split('/');
  switch (kind) {
    case 'step-theme': return `qcc-problem-identification-${a}`;
    case 'step-activity-plan': return `gantt-${a}`;
    case 'step-fishbone': return `qcc-fishbone-${a}`;
    case 'step-whywhy': return `qcc-whywhy-${a}`;
    case 'step-rootcauses': return `qcc-step4-rootcauses-${a}`;
    case 'step-countermeasure': return `qcc-countermeasure-v2-${a}`;
    case 'step-benefits': return `qcc-overall-benefits-v2-${a}`;
    case 'step-closure': return `qcc-final-closure-${a}`;
    case 'step-docs': return `stepdocs-${a}-${b}`;
    case 'config-activity-steps': return 'qcc-activity-steps-v2';
    case 'config-hierarchy': return 'qcc-hierarchy';
    case 'config-meeting-schedules': return 'qcc-meeting-schedules';
    case 'config-halfyear-ranges': return 'qcc-halfyear-ranges';
    case 'config-team-periods': return 'qcc-team-period';
    case 'eval-setup': return 'qcc-judge-evaluation-setup-v2';
    case 'eval-scores': return 'qcc-judge-evaluation-scores-v2';
    case 'eval-remarks': return 'qcc-judge-evaluation-remarks-v2';
    case 'eval-submitted': return 'qcc-eval-submitted-judges';
    case 'eval-team-levels': return 'qcc-eval-team-levels';
    default: return null;   // new kinds, or ones whose old copy cannot be mapped safely
  }
}

function readLegacy(key: string): unknown {
  const legacy = legacyKeyFor(key);
  if (!legacy) return null;
  try { const raw = localStorage.getItem(legacy); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function adopt(doc: SharedDoc): Entry {
  return {
    data: doc.data, version: doc.version, canEdit: doc.canEdit,
    status: doc.canEdit ? 'idle' : 'readonly', updatedAt: doc.updatedAt, updatedByName: doc.updatedByName,
  };
}

async function save(key: string): Promise<void> {
  const e = entries.get(key);
  if (!e || !e.canEdit) return;
  if (e.saving) { e.dirty = true; return; }   // saved again once the current save returns
  e.saving = true; e.dirty = false; e.status = 'saving'; notify();
  try {
    const doc = await api.saveDoc(key, e.data, e.version);
    e.version = doc.version; e.updatedAt = doc.updatedAt; e.updatedByName = doc.updatedByName;
    e.status = 'saved'; e.error = undefined;
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 0;
    e.status = status === 409 ? 'conflict' : status === 403 ? 'readonly' : 'error';
    e.error = err instanceof Error ? err.message : 'Could not save';
    if (status === 403) e.canEdit = false;
  } finally {
    e.saving = false;
    notify();
  }
  if (e.dirty && e.status === 'saved') void save(key);
}

export const sharedStore = {
  /** Fetch keys from the server. Already-loaded keys are skipped unless `force`; a key
   *  with unsaved local changes is never overwritten by a reload. */
  async load(keys: string[], opts: { force?: boolean } = {}): Promise<void> {
    const unique = [...new Set(keys)];
    // A key already being fetched is waited for, not fetched again: two loads racing
    // would both upload the old browser copy, and the second would hit a 409.
    const waiting = unique.filter(k => inflight.has(k)).map(k => inflight.get(k)!);
    const want = unique.filter(k => !inflight.has(k)).filter(k => {
      const e = entries.get(k);
      if (!e) return true;
      if (e.status === 'conflict' && !e.saving) { if (e.timer) clearTimeout(e.timer); e.timer = undefined; e.dirty = false; return true; }
      if (e.saving || e.timer || e.dirty) return false;
      return !!opts.force;
    });
    if (want.length) {
      const gen = generation;
      const fetching = (async () => {
        const docs = await api.getDocs(want);
        if (gen !== generation) return;   // signed out meanwhile
        const byKey = new Map(docs.map(d => [d.key, d]));
        const migrate: string[] = [];
        for (const key of want) {
          const doc = byKey.get(key);
          if (!doc) { entries.set(key, { data: null, version: 0, canEdit: false, status: 'readonly' }); continue; }
          const entry = adopt(doc);
          if (doc.version === 0 && doc.canEdit) {
            const legacy = readLegacy(key);
            if (legacy != null) { entry.data = legacy; migrate.push(key); }
          }
          entries.set(key, entry);
        }
        notify();
        await Promise.all(migrate.map(k => save(k)));
      })();
      want.forEach(k => inflight.set(k, fetching));
      try { await fetching; } finally { want.forEach(k => { if (inflight.get(k) === fetching) inflight.delete(k); }); }
    }
    await Promise.all(waiting);
  },

  /** Every saved document of one kind the user may read, by key (e.g. all projects'
   *  benefit sheets for the Dashboard). `candidates` are keys this browser may still hold
   *  under their old localStorage name; those are moved to the server first (as load does). */
  async loadKind<T = unknown>(kind: string, candidates: string[] = []): Promise<Record<string, T>> {
    const docs = await api.getDocsByKind(kind);
    const out: Record<string, T> = {};
    for (const d of docs) if (d.data != null) out[d.key] = d.data as T;
    const missing = candidates.filter(k => !(k in out) && readLegacy(k) != null);
    if (missing.length) {
      await sharedStore.load(missing, { force: true }).catch(() => { /* stays missing */ });
      for (const k of missing) { const v = sharedStore.get<T>(k); if (v != null && sharedStore.info(k)?.status !== 'readonly') out[k] = v; }
    }
    return out;
  },

  get<T = unknown>(key: string): T | null {
    return (entries.get(key)?.data as T) ?? null;
  },

  /** Change part of a document many people write at once (e.g. one meeting's minutes in
   *  the shared meeting log): fetch the latest copy, apply `change` to it and save now.
   *  If another PC saved in between, it starts again from their copy instead of failing. */
  async update<T = unknown>(key: string, change: (current: T | null) => T): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      await sharedStore.load([key], { force: true });
      const e = entries.get(key);
      if (!e) throw new Error('Could not load the latest data');
      if (!e.canEdit) throw new Error('You can view this but not change it');
      const next = change(e.data as T | null);
      e.saving = true; e.status = 'saving'; notify();
      try {
        const doc = await api.saveDoc(key, next, e.version);
        Object.assign(e, { data: next, version: doc.version, updatedAt: doc.updatedAt, updatedByName: doc.updatedByName, status: 'saved', error: undefined });
        return;
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        if (status === 409 && attempt < 3) continue;
        e.status = status === 403 ? 'readonly' : 'error';
        e.error = err instanceof Error ? err.message : 'Could not save';
        if (status === 403) e.canEdit = false;
        throw err;
      } finally {
        e.saving = false;
        notify();
      }
    }
  },

  /** Update a key and save it to the server shortly after. A read-only key keeps the
   *  change on screen only and reports 'readonly'. */
  set(key: string, data: unknown): void {
    let e = entries.get(key);
    if (!e) { e = { data, version: 0, canEdit: true, status: 'idle' }; entries.set(key, e); }
    // Pages re-save their state on every render pass; only a real change is sent.
    else if (e.data != null && JSON.stringify(e.data) === JSON.stringify(data)) return;
    e.data = data;
    if (!e.canEdit) { e.status = 'readonly'; notify(); return; }
    if (e.status === 'conflict') { notify(); return; }   // wait for the user to reload
    if (e.timer) clearTimeout(e.timer);
    e.dirty = true;
    e.timer = setTimeout(() => { e!.timer = undefined; void save(key); }, SAVE_DELAY_MS);
    notify();
  },

  canEdit(key: string): boolean { return !!entries.get(key)?.canEdit; },

  info(key: string): Pick<Entry, 'status' | 'error' | 'updatedAt' | 'updatedByName'> | null {
    const e = entries.get(key);
    return e ? { status: e.status, error: e.error, updatedAt: e.updatedAt, updatedByName: e.updatedByName } : null;
  },

  /** Save every key with a change still waiting (e.g. before the page closes). */
  flush(): void {
    entries.forEach((e, key) => { if (e.timer) { clearTimeout(e.timer); e.timer = undefined; void save(key); } });
  },

  hasPending(): boolean {
    for (const e of entries.values()) if (e.timer || e.saving) return true;
    return false;
  },

  /** Drop everything (on sign-out) so the next user never sees the last user's copy. */
  clear(): void {
    entries.forEach(e => { if (e.timer) clearTimeout(e.timer); });
    entries.clear();
    inflight.clear();
    generation++;
    notify();
  },

  subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; },
};

// Warn before closing the tab while a save is still on its way, and push it out.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', ev => {
    if (!sharedStore.hasPending()) return;
    sharedStore.flush();
    ev.preventDefault();
  });
}
