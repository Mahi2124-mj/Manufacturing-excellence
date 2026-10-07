import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CalendarPlus, Clock, MapPin, Users, Save, Send, X, Edit2, Trash2, Ban,
  AlertTriangle, CheckCircle2, Loader2, Building2, ShieldAlert, RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useHalfYear } from '../lib/halfYear';
import {
  useMeetingSchedules, computeScheduleDate, DAY_NAMES, MONTH_NAMES, WEEK_OPTIONS, MEETING_TYPES,
  type MeetingScheduleEntry, type ScheduleStatus,
} from '../lib/meetingSchedules';
import type { Team } from '../types';
import { useConfirm } from '../components/ConfirmDialog';

const DURATIONS = [30, 45, 60, 90, 120];

const STATUS_BADGE: Record<ScheduleStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  published: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

const prettyDate = (iso: string | null) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function CreateMeetingSchedule() {
  const { user } = useAuth();
  const hy = useHalfYear();
  const { schedules, createSchedule, updateSchedule, publishSchedule, cancelSchedule, removeSchedule, conflictsFor } = useMeetingSchedules();
  const askConfirm = useConfirm();
  const isAdmin = user?.role === 'admin';

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  // Hover tooltip: full team details, positioned fixed so the table's overflow doesn't clip it.
  const [hoverTeam, setHoverTeam] = useState<{ team: Team; x: number; y: number } | null>(null);
  const showTeamTip = (e: React.MouseEvent, team: Team) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverTeam({ team, x: Math.min(rect.left, window.innerWidth - 300), y: rect.bottom + 6 });
  };

  const blankForm = useCallback(() => ({
    teamId: '', qccYear: hy.active.year, month: new Date().getMonth() + 1,
    meetingDay: 'Monday', week: 'W1', time: '09:00', duration: 60,
    meetingType: 'Review', agenda: '', venue: '', instructions: '',
  }), [hy.active.year]);
  const [form, setForm] = useState(blankForm);

  const sync = useCallback(async () => {
    setSyncing(true);
    try { setTeams(await api.listTeams()); } catch { /* keep */ }
    finally { setSyncing(false); setLoading(false); }
  }, []);
  useEffect(() => { sync(); }, [sync]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } }, [toast]);

  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  // Team details are fetched live from Team Registration — never entered by hand.
  const team = teams.find(t => t.id === form.teamId) || null;
  const members = team?.members.filter(m => m.isActive) ?? [];
  const level = team ? (team.subDepartment ? `${team.department} › ${team.subDepartment}` : team.department) : '';

  const conflicts = useMemo(
    () => (form.teamId ? conflictsFor({ ...form, id: editingId ?? undefined }) : []),
    [form, editingId, conflictsFor],
  );
  const scheduledDate = form.teamId ? computeScheduleDate(form) : null;

  const resetForm = () => { setForm(blankForm()); setEditingId(null); };

  const validate = (): string | null => {
    if (!form.teamId) return 'Select a team first.';
    if (!form.venue.trim()) return 'Venue is required.';
    if (!form.time) return 'Meeting time is required.';
    if (conflicts.length) return 'Fix the clash first';
    return null;
  };

  const payload = () => ({
    teamId: form.teamId, qccYear: form.qccYear, month: form.month, meetingDay: form.meetingDay,
    week: form.week, time: form.time, duration: form.duration, meetingType: form.meetingType,
    agenda: form.agenda, venue: form.venue.trim(), instructions: form.instructions,
  });

  const save = (publish: boolean) => {
    if (!isAdmin) { setToast({ ok: false, text: 'Admins only' }); return; }
    const err = validate();
    if (err) { setToast({ ok: false, text: err }); return; }
    if (editingId) {
      updateSchedule(editingId, payload());
      if (publish) publishSchedule(editingId);
      setToast({ ok: true, text: publish ? 'Updated & published' : 'Meeting updated' });
    } else {
      createSchedule(payload(), publish);
      setToast({ ok: true, text: publish ? 'Meeting published' : 'Draft saved' });
    }
    resetForm();
  };

  const startEdit = (s: MeetingScheduleEntry) => {
    setEditingId(s.id);
    setForm({
      teamId: s.teamId, qccYear: s.qccYear, month: s.month, meetingDay: s.meetingDay, week: s.week,
      time: s.time, duration: s.duration, meetingType: s.meetingType, agenda: s.agenda, venue: s.venue, instructions: s.instructions,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const publishExisting = (s: MeetingScheduleEntry) => {
    const c = conflictsFor({ ...s, id: s.id });
    if (c.length) { setToast({ ok: false, text: c[0] }); return; }
    publishSchedule(s.id);
    setToast({ ok: true, text: 'Meeting published' });
  };

  const teamName = (id: string) => teams.find(t => t.id === id)?.name || id;

  // ── Quick schedule: tick a day → that team's meeting is set at the common Week + Time below ──
  const quickMonth = new Date().getMonth() + 1;
  // Common Week + Time applied to every team when you click a day (editable at the top).
  const [bulkWeek, setBulkWeek] = useState('Every');
  const [bulkTime, setBulkTime] = useState('09:00');
  const activeTeams = useMemo(() => teams.filter(t => t.status === 'active'), [teams]);
  const dayChecked = (teamId: string, day: string) =>
    schedules.some(s => s.teamId === teamId && s.meetingDay === day && s.status !== 'cancelled');
  const toggleDay = (teamId: string, day: string) => {
    if (!isAdmin) { setToast({ ok: false, text: 'Admins only' }); return; }
    const existing = schedules.filter(s => s.teamId === teamId && s.meetingDay === day && s.status !== 'cancelled');
    if (existing.length) {
      existing.forEach(s => removeSchedule(s.id));
      setToast({ ok: true, text: 'Meeting removed' });
    } else {
      // Ticking adds a DRAFT at the common Week + Time — "Publish" below makes them all live.
      createSchedule({ teamId, qccYear: hy.active.year, month: quickMonth, meetingDay: day, week: bulkWeek, time: bulkTime, duration: 60, meetingType: 'General', agenda: '', venue: '', instructions: '' }, false);
      setToast({ ok: true, text: 'Added — click Publish all' });
    }
  };

  const draftCount = schedules.filter(s => s.status === 'draft').length;
  const publishAll = () => {
    if (!isAdmin) { setToast({ ok: false, text: 'Admins only' }); return; }
    const drafts = schedules.filter(s => s.status === 'draft');
    if (!drafts.length) { setToast({ ok: false, text: 'Nothing to publish — set some days first' }); return; }
    drafts.forEach(s => publishSchedule(s.id));
    setToast({ ok: true, text: `Published ${drafts.length} meeting${drafts.length > 1 ? 's' : ''}` });
  };

  const field = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white disabled:bg-slate-100 disabled:text-slate-400';
  const label = 'block text-xs font-semibold text-slate-600 mb-1.5';

  return (
    <div className="space-y-5">
      {toast && (
        <div className="fixed top-6 right-6 z-[100]">
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-2xl text-white text-sm font-medium max-w-sm ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
            {toast.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />} {toast.text}
          </div>
        </div>
      )}

      {hoverTeam && (() => {
        const t = hoverTeam.team;
        const active = t.members.filter(m => m.isActive);
        const Row = ({ k, v }: { k: string; v: string }) => (
          <div className="flex gap-2"><dt className="w-[74px] flex-shrink-0 text-slate-400 font-medium">{k}</dt><dd className="text-slate-700 min-w-0">{v || '—'}</dd></div>
        );
        return (
          <div style={{ position: 'fixed', top: hoverTeam.y, left: hoverTeam.x, zIndex: 200, width: 288 }}
            className="pointer-events-none rounded-xl border border-slate-200 bg-white shadow-2xl p-3.5 text-xs">
            <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-800 truncate">{t.name}</p>
              <span className="text-[9px] font-mono text-slate-400 flex-shrink-0">{t.id}</span>
            </div>
            <dl className="space-y-1.5">
              <Row k="Department" v={t.department + (t.subDepartment ? ` › ${t.subDepartment}` : '')} />
              <Row k="Leader" v={t.leaderName} />
              <Row k="Facilitator" v={t.facilitatorName} />
              <Row k="Coordinator" v={t.coordinatorName} />
              <Row k="Project" v={t.projectTheme} />
              <div className="flex gap-2"><dt className="w-[74px] flex-shrink-0 text-slate-400 font-medium">Status</dt><dd className="text-slate-700 capitalize">{t.status}</dd></div>
              <Row k="Members" v={`${active.length} active${active.length ? ` · ${active.map(m => m.memberName).join(', ')}` : ''}`} />
            </dl>
          </div>
        );
      })()}

      {!isAdmin && (
        <div className="flex items-center gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
          <ShieldAlert size={18} className="text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">Only an <strong>Admin</strong> can create, edit, reschedule, publish or cancel meeting schedules. You have read-only access.</p>
        </div>
      )}

      {/* ── Meeting schedule: tick the weekdays each team meets ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Meeting Schedule</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Click a day to set that team's meeting · {activeTeams.length} active team{activeTeams.length === 1 ? '' : 's'}{draftCount > 0 && ` · ${draftCount} unpublished`}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <span className="font-medium text-slate-600">Applies to all:</span>
              <label className="text-slate-500">Week</label>
              <select value={bulkWeek} onChange={e => setBulkWeek(e.target.value)} disabled={!isAdmin} className="px-2 py-1 border border-slate-300 rounded-md text-xs bg-white outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50">
                {WEEK_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <label className="text-slate-500">Time</label>
              <input type="time" value={bulkTime} onChange={e => setBulkTime(e.target.value)} disabled={!isAdmin} className="px-2 py-1 border border-slate-300 rounded-md text-xs bg-white outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50" />
            </div>
            <button onClick={publishAll} disabled={!isAdmin || draftCount === 0} className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Publish all{draftCount > 0 ? ` (${draftCount})` : ''}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-slate-50 z-10 px-5 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[200px] border-b border-slate-200">Team</th>
                {DAY_NAMES.map(d => <th key={d} className="px-2 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[64px] border-b border-slate-200">{d.slice(0, 3)}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={DAY_NAMES.length + 1} className="px-4 py-10 text-center text-slate-400"><Loader2 size={16} className="animate-spin inline mr-2" /> Loading teams…</td></tr>
              ) : activeTeams.length === 0 ? (
                <tr><td colSpan={DAY_NAMES.length + 1} className="px-4 py-10 text-center text-sm text-slate-400">No active teams found.</td></tr>
              ) : activeTeams.map(t => (
                <tr key={t.id} className="group">
                  <td
                    className="sticky left-0 bg-white group-hover:bg-slate-50 z-10 px-5 py-3 border-b border-slate-100 cursor-default transition-colors"
                    onMouseEnter={e => showTeamTip(e, t)}
                    onMouseLeave={() => setHoverTeam(null)}
                  >
                    <p className="text-sm font-semibold text-slate-800 truncate max-w-[180px]">{t.name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{t.department}</p>
                  </td>
                  {DAY_NAMES.map(d => {
                    const on = dayChecked(t.id, d);
                    return (
                      <td key={d} className="px-2 py-3 text-center border-b border-slate-100 group-hover:bg-slate-50/50 transition-colors">
                        <button
                          onClick={() => toggleDay(t.id, d)}
                          disabled={!isAdmin}
                          aria-pressed={on}
                          title={`${t.name} · ${d}`}
                          className={`w-8 h-8 rounded-md align-middle transition-all ${on ? 'bg-blue-600 shadow-sm shadow-blue-600/30' : 'bg-white border border-slate-300 hover:border-blue-400 hover:bg-blue-50/40'} disabled:opacity-40 disabled:cursor-not-allowed`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Existing schedules */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-800">Meeting Schedules <span className="text-slate-400 font-normal">({schedules.length})</span></h3>
          <button onClick={sync} disabled={syncing} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-300 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} /> Sync teams
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Team', 'When', 'Time', 'Type', 'Venue', 'Status', 'Actions'].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide ${i === 6 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400"><Loader2 size={16} className="animate-spin inline mr-2" /> Loading…</td></tr>
              ) : schedules.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">No schedules yet. Create one above — publishing pushes it to the team’s Meeting Management.</td></tr>
              ) : schedules.map(s => (
                <tr key={s.id} className={`hover:bg-slate-50/60 ${s.status === 'cancelled' ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">{teamName(s.teamId)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{MONTH_NAMES[s.month - 1]?.slice(0, 3)} {s.qccYear} · {s.meetingDay.slice(0, 3)} · {s.week}<div className="text-[10px] text-slate-400">{prettyDate(computeScheduleDate(s))}</div></td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap"><Clock size={11} className="inline text-slate-400 mr-1" />{s.time} · {s.duration}m</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{s.meetingType}</td>
                  <td className="px-4 py-3 text-xs text-slate-600"><MapPin size={11} className="inline text-slate-400 mr-1" />{s.venue}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${STATUS_BADGE[s.status]}`}>{s.status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {s.status !== 'published' && <button onClick={() => publishExisting(s)} disabled={!isAdmin} title="Publish" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-emerald-600 disabled:opacity-40"><Send size={14} /></button>}
                      {s.status === 'published' && <button onClick={() => cancelSchedule(s.id)} disabled={!isAdmin} title="Cancel schedule" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-amber-600 disabled:opacity-40"><Ban size={14} /></button>}
                      <button onClick={async () => { if (await askConfirm({ title: 'Delete this schedule?', message: 'This cannot be undone.' })) removeSchedule(s.id); }} disabled={!isAdmin} title="Delete" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-red-600 disabled:opacity-40"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
