import type { ReactNode } from 'react';

// Accent keys reused across pages so every summary card stays colour-consistent.
export const STAT_GRADIENTS = [
  'from-blue-400 to-indigo-500',
  'from-emerald-400 to-teal-500',
  'from-amber-400 to-orange-500',
  'from-violet-400 to-purple-500',
  'from-rose-400 to-red-500',
  'from-cyan-400 to-sky-500',
];

// Left-border badge style: white card, coloured LEFT edge + coloured label, big dark number.
// The accent must be side-specific (`border-l-*`) — a full `border-*` colours all four
// sides and clashes with `border-slate-200`, which in Tailwind v4 resolves by source order
// (some colours win, some lose) → an inconsistent extra/"double" outline. `border-l-*`
// only sets the left edge and reliably wins, so every card gets one clean accent line.
// Active/selected uses a soft background tint (not a ring — the ring utility renders empty here).
const ACCENT: Record<string, { border: string; text: string; bg: string }> = {
  'from-blue-400 to-indigo-500':   { border: 'border-l-blue-500',    text: 'text-blue-600',    bg: 'bg-blue-50' },
  'from-emerald-400 to-teal-500':  { border: 'border-l-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' },
  'from-amber-400 to-orange-500':  { border: 'border-l-amber-500',   text: 'text-amber-600',   bg: 'bg-amber-50' },
  'from-violet-400 to-purple-500': { border: 'border-l-violet-500',  text: 'text-violet-600',  bg: 'bg-violet-50' },
  'from-rose-400 to-red-500':      { border: 'border-l-rose-500',    text: 'text-rose-600',    bg: 'bg-rose-50' },
  'from-cyan-400 to-sky-500':      { border: 'border-l-cyan-500',    text: 'text-cyan-600',    bg: 'bg-cyan-50' },
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  grad?: string;      // accent key (from STAT_GRADIENTS)
  trend?: string;
  up?: boolean;
  sub?: ReactNode;
  active?: boolean;   // highlight when this card acts as an active filter
  onClick?: () => void;
}

// KPI/summary badge card — coloured left border + coloured label + big dark number + sub.
export default function StatCard({ label, value, icon, grad = STAT_GRADIENTS[0], sub, active, onClick }: StatCardProps) {
  const Comp: any = onClick ? 'button' : 'div';
  const a = ACCENT[grad] || ACCENT['from-blue-400 to-indigo-500'];
  return (
    <Comp
      {...(onClick ? { type: 'button', onClick } : {})}
      className={`text-left rounded-xl border border-slate-200 border-l-4 ${a.border} shadow-sm p-4 transition-all w-full ${
        active ? `${a.bg} shadow-md` : 'bg-white'
      } ${onClick ? 'hover:shadow-md hover:-translate-y-0.5 focus:outline-none cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className={`text-[11px] font-bold uppercase tracking-wide ${a.text}`}>{label}</span>
        <span className={`${a.text} opacity-70 flex-shrink-0`}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
      {sub != null && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </Comp>
  );
}
