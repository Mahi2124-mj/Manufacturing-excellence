// ─── Global confirm dialog ───────────────────────────────────────────────
// A promise-based confirmation popup so destructive actions (deletes) always
// ask "Delete / Cancel" before running — nothing is removed by a mis-click.
//
//   const askConfirm = useConfirm();
//   ...
//   onClick={async () => { if (await askConfirm({ message: 'Delete this row?' })) doDelete(); }}
//
// Wrap the app once in <ConfirmProvider> (see App.tsx). Reuses the `scaleIn`
// keyframe already defined in index.css.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

export interface ConfirmOptions {
  title?: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'default';   // danger (red, default) for deletes, default (blue) otherwise
}

type Ask = (opts?: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<Ask | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const askConfirm = useCallback<Ask>((o) => {
    setOpts(o || {});
    return new Promise<boolean>((resolve) => { resolverRef.current = resolve; });
  }, []);

  const close = (val: boolean) => {
    resolverRef.current?.(val);
    resolverRef.current = null;
    setOpts(null);
  };

  const danger = !opts || opts.tone !== 'default';

  return (
    <ConfirmCtx.Provider value={askConfirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => close(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-[scaleIn_0.18s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4 flex items-start gap-4">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${danger ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                {danger ? <Trash2 size={20} /> : <AlertTriangle size={22} />}
              </div>
              <div className="min-w-0 pt-0.5">
                <h3 className="text-base font-bold text-slate-800">{opts.title || 'Delete this item?'}</h3>
                <p className="text-sm text-slate-500 mt-1">{opts.message || 'This action cannot be undone.'}</p>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => close(false)}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {opts.cancelText || 'Cancel'}
              </button>
              <button
                onClick={() => close(true)}
                autoFocus
                className={`px-5 py-2.5 text-sm font-semibold text-white rounded-lg shadow-sm transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {opts.confirmText || 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm(): Ask {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
