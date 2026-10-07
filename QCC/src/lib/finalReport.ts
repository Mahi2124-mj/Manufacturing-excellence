// ─── Final Project Report (print-ready A4 PDF) ──────────────────────────────
// Builds a clean, read-only A4 document from APPROVED project data across all
// workflow steps, opens it in a new window and triggers the browser's native
// "Save as PDF". No editable fields, buttons, sidebars or empty sections — just
// the approved record, suitable for management, audits and QCC competitions.
import type { QCCProject, Team } from '../types';
import type { WorkflowStepView } from './activitySteps';
import type { ClosureState } from '../components/FinalProjectClosure';
import { CIRCLE_ASSESSMENT, circleLevel } from './circleAssessment';

export interface ReportCtx {
  project: QCCProject;
  team: Team | null;
  workflowSteps: WorkflowStepView[];
  closure: ClosureState;
  periodLabel?: string;
  generatedAt: string;        // pre-formatted (callers stamp the time)
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const readLS = (key: string): any => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; } };
const num = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const fmt = (n: number) => n % 1 === 0 ? n.toLocaleString('en-IN') : n.toFixed(1);
const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
const shorten = (s: string, n = 16) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const stepApproved = (p: QCCProject, n: number) => (p.steps.find(s => s.stepNumber === n)?.status === 'approved');

// ── Inline SVG charts (print-safe, no library) ──
function groupedBars(cats: { label: string; a: number; b: number }[], labelA: string, labelB: string): string {
  if (!cats.length) return '';
  const W = 720, H = 250, padL = 44, padB = 66, padT = 12, padR = 12;
  const plotH = H - padT - padB, plotW = W - padL - padR;
  const max = Math.max(1, ...cats.flatMap(c => [c.a, c.b]));
  const gw = plotW / cats.length, bw = Math.min(26, gw / 3.2);
  let bars = '';
  cats.forEach((c, i) => {
    const cx = padL + i * gw + gw / 2;
    const ha = (c.a / max) * plotH, hb = (c.b / max) * plotH;
    const ya = padT + plotH - ha, yb = padT + plotH - hb;
    bars += `<rect x="${(cx - bw - 2).toFixed(1)}" y="${ya.toFixed(1)}" width="${bw}" height="${Math.max(0, ha).toFixed(1)}" fill="#94a3b8"/>`;
    bars += `<rect x="${(cx + 2).toFixed(1)}" y="${yb.toFixed(1)}" width="${bw}" height="${Math.max(0, hb).toFixed(1)}" fill="#2563eb"/>`;
    bars += `<text x="${cx.toFixed(1)}" y="${H - padB + 14}" font-size="9" text-anchor="middle" fill="#475569">${esc(shorten(c.label))}</text>`;
    bars += `<text x="${(cx - bw / 2 - 2).toFixed(1)}" y="${(ya - 3).toFixed(1)}" font-size="8" text-anchor="middle" fill="#64748b">${fmt(c.a)}</text>`;
    bars += `<text x="${(cx + bw / 2 + 2).toFixed(1)}" y="${(yb - 3).toFixed(1)}" font-size="8" text-anchor="middle" fill="#1d4ed8">${fmt(c.b)}</text>`;
  });
  const axis = `<line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="#cbd5e1"/>`;
  const legend = `<g><rect x="${padL}" y="${H - 15}" width="10" height="10" fill="#94a3b8"/><text x="${padL + 14}" y="${H - 6}" font-size="9" fill="#475569">${esc(labelA)}</text><rect x="${padL + 90}" y="${H - 15}" width="10" height="10" fill="#2563eb"/><text x="${padL + 104}" y="${H - 6}" font-size="9" fill="#475569">${esc(labelB)}</text></g>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:720px">${axis}${bars}${legend}</svg>`;
}
function bars(items: { label: string; value: number }[], color = '#059669'): string {
  if (!items.length) return '';
  const W = 720, H = 240, padL = 44, padB = 62, padT = 12, padR = 12;
  const plotH = H - padT - padB, plotW = W - padL - padR;
  const max = Math.max(1, ...items.map(i => i.value));
  const gw = plotW / items.length, bw = Math.min(46, gw / 1.8);
  let out = '';
  items.forEach((it, i) => {
    const cx = padL + i * gw + gw / 2;
    const h = (it.value / max) * plotH, y = padT + plotH - h;
    out += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${Math.max(0, h).toFixed(1)}" fill="${color}" rx="2"/>`;
    out += `<text x="${cx.toFixed(1)}" y="${H - padB + 14}" font-size="9" text-anchor="middle" fill="#475569">${esc(shorten(it.label))}</text>`;
    out += `<text x="${cx.toFixed(1)}" y="${(y - 3).toFixed(1)}" font-size="8" text-anchor="middle" fill="#065f46">${fmt(it.value)}</text>`;
  });
  const axis = `<line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="#cbd5e1"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:720px">${axis}${out}</svg>`;
}

const fmtDelta = (d: number) => (d > 0 ? '+' : '') + fmt(d);

// Radar (spider) chart — used for the circle-assessment skill metrics (Before vs After).
function radarSvg(labels: string[], before: number[], after: number[], color: string): string {
  const n = labels.length; if (!n) return '';
  const cx = 128, cy = 116, R = 82, max = 10;
  const pt = (i: number, v: number): [number, number] => {
    const ang = (-90 + i * (360 / n)) * Math.PI / 180;
    const r = (Math.min(max, Math.max(0, v)) / max) * R;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  };
  const ptsOf = (vals: number[]) => vals.map((v, i) => pt(i, v).map(x => x.toFixed(1)).join(',')).join(' ');
  const grid = [2, 4, 6, 8, 10].map(l => `<polygon points="${labels.map((_, i) => pt(i, l).map(x => x.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${l === 10 ? '#94a3b8' : '#e5e9f0'}"/>`).join('');
  const spokes = labels.map((_, i) => { const [x, y] = pt(i, max); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#cbd5e1"/>`; }).join('');
  const labs = labels.map((lb, i) => { const [x, y] = pt(i, max + 1.8); return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="9" font-weight="700" text-anchor="middle" fill="#475569">${esc(lb)}</text>`; }).join('');
  const bPoly = before.some(v => v > 0) ? `<polygon points="${ptsOf(before)}" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4 2"/>` : '';
  const aPoly = after.some(v => v > 0) ? `<polygon points="${ptsOf(after)}" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="1.8"/>` : '';
  return `<svg viewBox="0 0 256 240" width="240" height="225">${grid}${spokes}${labs}${bPoly}${aPoly}</svg>`;
}

// Fishbone (Ishikawa) diagram — spine + 6M branches + effect box, from categorised causes.
function fishboneSvg(problem: string, groups: Record<string, string[]>): string {
  const order: { name: string; side: -1 | 1 }[] = [
    { name: 'Man', side: -1 }, { name: 'Machine', side: -1 }, { name: 'Method', side: -1 },
    { name: 'Material', side: 1 }, { name: 'Measurement', side: 1 }, { name: 'Environment', side: 1 },
  ];
  const colors: Record<string, string> = { Man: '#3b82f6', Machine: '#10b981', Method: '#f59e0b', Material: '#8b5cf6', Measurement: '#ef4444', Environment: '#06b6d4' };
  const active = order.filter(c => (groups[c.name] || []).length > 0);
  if (!active.length) return '';
  const W = 760, H = 340, spineY = H / 2, xTail = 18, xHead = W - 150, effW = 128, effH = 62;
  const tops = active.filter(c => c.side < 0), bots = active.filter(c => c.side > 0);
  const place = (list: unknown[], i: number) => xTail + 132 + ((xHead - 56 - (xTail + 132)) / Math.max(1, list.length)) * (i + 0.5);
  let g = '';
  const drawBranch = (name: string, x: number, side: -1 | 1) => {
    const col = colors[name];
    const tipY = spineY + side * 116, bx = x - 44;
    g += `<line x1="${x.toFixed(0)}" y1="${spineY}" x2="${bx.toFixed(0)}" y2="${tipY.toFixed(0)}" stroke="${col}" stroke-width="2"/>`;
    g += `<rect x="${(bx - 40).toFixed(0)}" y="${(tipY - 9).toFixed(0)}" width="80" height="18" rx="9" fill="${col}"/><text x="${bx.toFixed(0)}" y="${(tipY + 3.5).toFixed(0)}" font-size="9" font-weight="700" text-anchor="middle" fill="#fff">${esc(name)}</text>`;
    (groups[name] || []).slice(0, 4).forEach((t, i) => {
      const yy = side < 0 ? spineY - 24 - i * 20 : spineY + 24 + i * 20;
      const xx = x + 4 + i * 6;
      g += `<text x="${xx.toFixed(0)}" y="${yy.toFixed(0)}" font-size="8" text-anchor="start" fill="#334155">– ${esc(shorten(t, 22))}</text>`;
    });
  };
  tops.forEach((c, i) => drawBranch(c.name, place(tops, i), -1));
  bots.forEach((c, i) => drawBranch(c.name, place(bots, i), 1));
  const spine = `<line x1="${xTail}" y1="${spineY}" x2="${xHead}" y2="${spineY}" stroke="#334155" stroke-width="3"/><polygon points="${xHead},${spineY - 9} ${xHead + 12},${spineY} ${xHead},${spineY + 9}" fill="#334155"/>`;
  const eff = `<rect x="${xHead + 14}" y="${(spineY - effH / 2).toFixed(0)}" width="${effW}" height="${effH}" rx="6" fill="#1e3a8a"/><text x="${(xHead + 14 + effW / 2).toFixed(0)}" y="${(spineY - 8).toFixed(0)}" font-size="7.5" font-weight="700" text-anchor="middle" fill="#93c5fd">EFFECT / PROBLEM</text><text x="${(xHead + 14 + effW / 2).toFixed(0)}" y="${(spineY + 9).toFixed(0)}" font-size="8.5" font-weight="700" text-anchor="middle" fill="#fff">${esc(shorten(problem, 20))}</text>`;
  return `<svg viewBox="0 0 ${W + 4} ${H}" width="100%" style="max-width:760px">${spine}${g}${eff}</svg>`;
}

// Team skill assessment (Circle Assessment) — X/Y radars + skill-metric table.
function teamAssessmentSection(): string {
  const data = readLS('qcc-circle-assessment-v4');
  const members: any[] = data?.members || [];
  if (!members.length) return '';
  const checked = data.checked || {};
  const CATS_X = CIRCLE_ASSESSMENT[0].categories, CATS_Y = CIRCLE_ASSESSMENT[1].categories;
  const catCount = (mid: string, phase: string, cat: { code: string; items: string[] }) => {
    const set: string[] = checked[mid]?.[phase] || [];
    let c = 0; for (let i = 0; i < cat.items.length; i++) if (set.includes(`${cat.code}:${i}`)) c++;
    return c;
  };
  const avg = (phase: string, cat: { code: string; items: string[] }) => members.reduce((s, m) => s + catCount(m.id, phase, cat), 0) / members.length;
  const xb = CATS_X.map(c => avg('before', c)), xa = CATS_X.map(c => avg('after', c));
  const yb = CATS_Y.map(c => avg('before', c)), ya = CATS_Y.map(c => avg('after', c));
  if (![...xb, ...xa, ...yb, ...ya].some(v => v > 0)) return '';
  const xL = CATS_X.map(c => c.code.split('-')[1].toUpperCase());
  const yL = CATS_Y.map(c => c.code.split('-')[1].toUpperCase());
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
  const lvlB = circleLevel(mean(xb), mean(yb)), lvlA = circleLevel(mean(xa), mean(ya));
  const radars = `<div class="radar-row">
    <figure class="radar-cell"><figcaption><span class="ax" style="background:#2563eb">X</span> Circle's Ability (skill metrics a–e)</figcaption>${radarSvg(xL, xb, xa, '#2563eb')}</figure>
    <figure class="radar-cell"><figcaption><span class="ax" style="background:#7c3aed">Y</span> Positive &amp; Satisfying Workplace</figcaption>${radarSvg(yL, yb, ya, '#7c3aed')}</figure>
  </div>
  <p class="radar-legend"><span class="ln dash"></span> Before &nbsp;·&nbsp; <span class="ln solid"></span> After &nbsp;·&nbsp; ${esc(String(members.length))} member(s)</p>
  <p class="kpi"><span>Circle Level — X ${fmt(mean(xb))}→${fmt(mean(xa))}, Y ${fmt(mean(yb))}→${fmt(mean(ya))} (0–10)</span><strong>${esc(lvlB.grade)} → ${esc(lvlA.grade)}</strong></p>`;
  const rows = [
    ...CATS_X.map((c, i) => [esc(c.name), 'X', fmt(xb[i]), fmt(xa[i]), fmtDelta(xa[i] - xb[i])]),
    ...CATS_Y.map((c, i) => [esc(c.name), 'Y', fmt(yb[i]), fmt(ya[i]), fmtDelta(ya[i] - yb[i])]),
  ];
  return radars + `<h3>Skill Metrics — category scores (0–10, team average)</h3>` + table(['Skill Metric', 'Axis', 'Before', 'After', 'Δ'], rows);
}

const section = (title: string, body: string) => body.trim() ? `<section class="sec"><h2>${esc(title)}</h2>${body}</section>` : '';
const table = (headers: string[], rows: string[][]) =>
  `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

// ── Per-step section builders (return '' when empty → section is dropped) ──
function themeSection(p: QCCProject): string {
  const saved = readLS(`qcc-problem-identification-${p.id}`);
  const points: any[] = saved?.points ?? [];
  const chosen = points.find(pt => pt.id === saved?.selectedThemeId);
  let body = `<p><strong>Theme / Title:</strong> ${esc(p.title)}</p>`;
  if (p.problemStatement) body += `<p><strong>Problem statement:</strong> ${esc(p.problemStatement)}</p>`;
  if (chosen?.description) body += `<p><strong>Selected improvement theme:</strong> ${esc(chosen.description)}</p>`;
  if (points.length) body += table(['#', 'Candidate Improvement Theme'], points.map((pt, i) => [String(pt.sr ?? i + 1), esc(pt.description)]));
  return body;
}
function activityPlanSection(p: QCCProject): string {
  const entries: any[] = readLS(`gantt-${p.id}`) || [];
  if (!entries.length) return '';
  return table(['Activity', 'PIC', 'Planned Start', 'Planned End', 'Actual Start', 'Actual End', 'Status'],
    entries.map(e => [esc(e.activityName), esc(e.pic || '—'), esc(e.plannedStart || '—'), esc(e.plannedEnd || '—'), esc(e.actualStart || '—'), esc(e.actualEnd || '—'), esc((e.status || '').replace(/_/g, ' '))]));
}
function rootCauseSection(p: QCCProject): string {
  // Fishbone (Ishikawa) chart from the persisted Step-4 causes.
  let fishbone = '';
  const fb = readLS(`qcc-fishbone-${p.id}`);
  if (fb && Array.isArray(fb.causes) && fb.causes.length) {
    const groups: Record<string, string[]> = {};
    fb.causes.forEach((c: any) => { if (c?.text) { (groups[c.category] || (groups[c.category] = [])).push(c.text); } });
    const problem = fb.problemStatement || p.problemStatement || p.title;
    const svg = fishboneSvg(problem, groups);
    if (svg) fishbone = `<h3>Fishbone (Ishikawa) Diagram</h3>${svg}<p class="cap">Effect / Problem: ${esc(problem)}</p>`;
  }

  const rows: any[] = readLS(`qcc-whywhy-${p.id}`) || [];
  const chains = rows.map(r => {
    const whys = ['why1', 'why2', 'why3', 'why4', 'why5']
      .map(k => (r.whyLevels?.[k] || []).map((w: any) => w.text).filter(Boolean).join('; '))
      .filter(Boolean).map((t, i) => `<li><em>Why ${i + 1}:</em> ${esc(t)}</li>`).join('');
    return `<div class="card"><p><strong>Cause:</strong> ${esc(r.cause)}</p>${whys ? `<ol class="why">${whys}</ol>` : ''}<p><strong>Root cause:</strong> ${esc(r.rootCause || '—')}</p><p><strong>Countermeasure:</strong> ${esc(r.countermeasure || '—')}</p></div>`;
  }).join('');

  if (!fishbone && !chains) return '';
  return fishbone + (chains ? `<h3>Why-Why Analysis &amp; Root Causes</h3>${chains}` : '');
}
function countermeasureSection(p: QCCProject): string {
  const rcs: any[] = readLS(`qcc-countermeasure-v2-${p.id}`) || [];
  if (!rcs.length) return '';
  const rows: string[][] = [];
  rcs.forEach(rc => {
    const approvedCm = (rc.countermeasures || []).find((c: any) => c.id === rc.approvedCountermeasureId);
    rows.push([
      esc(rc.text),
      esc(approvedCm?.text || (rc.countermeasures?.[0]?.text) || '—'),
      esc((rc.approvalStatus || 'pending').replace(/^\w/, (m: string) => m.toUpperCase())),
      esc((rc.implementation || []).map((t: any) => `${t.task} (${(t.status || '').replace(/_/g, ' ')})`).join('; ') || '—'),
    ]);
  });
  return table(['Root Cause', 'Approved / Best Countermeasure', 'Status', 'Implementation'], rows);
}
function standardizationSection(): string {
  const data = readLS('qcc-standardization-control');
  if (!data) return '';
  let body = '';
  const docs: any[] = data.docs || [];
  const ctrl: any[] = data.ctrl || [];
  if (docs.length) body += `<h3>Standardization Documents</h3>` + table(['Type', 'Document', 'Doc No.', 'Rev'], docs.map(d => [esc(d.documentType), esc(d.documentName), esc(d.docNumber || '—'), esc(d.revNo || '—')]));
  const filledCtrl = ctrl.filter(r => r.when || r.who || r.frequency || r.what);
  if (filledCtrl.length) body += `<h3>Control Plan</h3>` + table(['When', 'Who', 'Frequency', 'What', 'Evidence'], filledCtrl.map(r => [esc(r.when || '—'), esc(r.who || '—'), esc(r.frequency || '—'), esc(r.what || '—'), esc(r.evidence?.name || '—')]));
  if (data.approval) body += `<p class="approved-note">✔ Standardization approved &amp; locked by ${esc(data.approval.by)} on ${esc(new Date(data.approval.at).toLocaleDateString())}.</p>`;
  return body;
}
function benefitsSection(p: QCCProject): { body: string; totalSaving: number } {
  const data = readLS(`qcc-overall-benefits-v2-${p.id}`);
  if (!data) return { body: '', totalSaving: 0 };
  const tangible: any[] = data.tangible || [];
  const intangible: any[] = data.intangible || [];
  const filled = tangible.filter(t => t.before || t.after || t.yearlySaving);
  const totalSaving = tangible.reduce((s, t) => s + num(t.yearlySaving), 0);

  let body = '';
  if (totalSaving > 0) body += `<p class="kpi"><span>Total Annual Saving</span><strong>${inr(totalSaving)}</strong></p>`;

  const beforeAfter = filled.filter(t => num(t.before) > 0 || num(t.after) > 0).map(t => ({ label: t.benefit, a: num(t.before), b: num(t.after) }));
  if (beforeAfter.length) body += `<h3>Before vs After</h3>${groupedBars(beforeAfter, 'Before', 'After')}`;

  const savingBars = tangible.filter(t => num(t.yearlySaving) > 0).map(t => ({ label: t.benefit, value: num(t.yearlySaving) }));
  if (savingBars.length) body += `<h3>Annual Saving by Benefit</h3>${bars(savingBars)}`;

  if (filled.length) body += `<h3>Benefit Breakdown</h3>` + table(['Benefit', 'Before', 'After', 'Frequency', 'Annual Saving'],
    filled.map(t => [esc(t.benefit), esc(t.before || '—'), esc(t.after || '—'), esc(t.frequency || '—'), num(t.yearlySaving) ? inr(num(t.yearlySaving)) : '—']));

  const achieved = intangible.filter(t => t.achieved);
  if (achieved.length) body += `<h3>Intangible Benefits</h3><ul class="chips">${achieved.map(t => `<li>${esc(t.benefit)}</li>`).join('')}</ul>`;

  return { body, totalSaving };
}

export function buildFinalReportHTML(ctx: ReportCtx): string {
  const { project: p, team, workflowSteps, closure, periodLabel, generatedAt } = ctx;
  const advisor = team?.facilitatorName || '—';
  const decision = closure.approval?.decision === 'approved' ? 'Approved &amp; Closed' : closure.approval?.decision === 'rejected' ? 'Sent back for correction' : 'Pending Advisor Approval';
  const decCls = closure.approval?.decision === 'approved' ? 'ok' : closure.approval?.decision === 'rejected' ? 'bad' : 'warn';

  // Approval overview (all steps + their status).
  const overview = table(['#', 'Workflow Step', 'Status'], workflowSteps.map(s => {
    const st = s.number <= p.steps.length ? (p.steps.find(x => x.stepNumber === s.number)?.status || 'draft') : (p.steps.every(x => x.status === 'approved') ? 'approved' : 'pending');
    return [String(s.number), esc(s.title), `<span class="pill ${st === 'approved' ? 'ok' : st === 'rework' ? 'bad' : 'warn'}">${esc(st.replace(/_/g, ' '))}</span>`];
  }));

  // Per-step detailed sections — only for APPROVED steps (empty ones drop out).
  const built: Record<string, () => string> = {
    theme: () => themeSection(p),
    'activity-plan': () => activityPlanSection(p),
    'root-cause': () => rootCauseSection(p),
    countermeasure: () => countermeasureSection(p),
    standardization: () => standardizationSection(),
  };
  const stepSections = workflowSteps
    .filter(s => s.workflowKey && built[s.workflowKey] && stepApproved(p, s.number))
    .map(s => section(`Step ${s.number} · ${s.title}`, built[s.workflowKey!]()))
    .join('');

  const { body: benefitsBody, totalSaving } = benefitsSection(p);
  const benefitsHtml = section('Overall Benefits', benefitsBody);

  const closureBody = `
    <div class="grid2">
      <div><span class="k">Overall Project Status</span><span class="v">${esc(closure.overallStatus)}</span></div>
      <div><span class="k">Project Closure Date</span><span class="v">${esc(closure.closureDate || '—')}</span></div>
      <div><span class="k">Advisor Decision</span><span class="v ${decCls}">${decision}</span></div>
      ${closure.approval ? `<div><span class="k">Decided By</span><span class="v">${esc(closure.approval.by)} · ${esc(new Date(closure.approval.at).toLocaleDateString())}</span></div>` : ''}
    </div>
    ${closure.finalComments ? `<h3>Final Comments</h3><p>${esc(closure.finalComments)}</p>` : ''}
    ${closure.lessonsLearned ? `<h3>Lessons Learned</h3><p>${esc(closure.lessonsLearned)}</p>` : ''}`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(p.title)} — Final QCC Report</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  html,body { margin:0; padding:0; }
  body { font-family:'Segoe UI',Roboto,Arial,sans-serif; color:#1e293b; font-size:12px; line-height:1.5; }
  .toolbar { position:sticky; top:0; background:#0f172a; color:#fff; padding:10px 16px; display:flex; justify-content:space-between; align-items:center; }
  .toolbar button { background:#2563eb; color:#fff; border:0; padding:8px 16px; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; }
  .page { max-width:800px; margin:0 auto; padding:8px 4px 40px; }
  .cover { text-align:center; padding:60px 20px 40px; border-bottom:3px solid #2563eb; margin-bottom:20px; }
  .cover .brand { font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:#2563eb; font-weight:700; }
  .cover h1 { font-size:26px; margin:14px 0 6px; }
  .cover .sub { color:#64748b; font-size:13px; }
  .cover .badge { display:inline-block; margin-top:16px; padding:6px 16px; border-radius:999px; font-weight:700; font-size:12px; }
  .badge.ok,.pill.ok,.v.ok { background:#dcfce7; color:#166534; } .badge.warn,.pill.warn,.v.warn { background:#fef3c7; color:#92400e; } .badge.bad,.pill.bad,.v.bad { background:#fee2e2; color:#991b1b; }
  .meta { display:grid; grid-template-columns:repeat(2,1fr); gap:8px 24px; max-width:560px; margin:20px auto 0; text-align:left; }
  .meta div { display:flex; justify-content:space-between; border-bottom:1px dotted #e2e8f0; padding:4px 0; font-size:12px; }
  .meta .k { color:#64748b; } .meta .v { font-weight:600; }
  .sec { margin:22px 0; page-break-inside:avoid; }
  h2 { font-size:15px; color:#1e3a8a; border-bottom:2px solid #e2e8f0; padding-bottom:6px; margin:0 0 12px; }
  h3 { font-size:12.5px; color:#334155; margin:16px 0 8px; }
  table { width:100%; border-collapse:collapse; margin:8px 0; font-size:10.5px; }
  th { background:#f1f5f9; text-align:left; padding:6px 8px; border:1px solid #e2e8f0; color:#475569; text-transform:uppercase; font-size:9px; letter-spacing:.03em; }
  td { padding:6px 8px; border:1px solid #e2e8f0; vertical-align:top; }
  tr:nth-child(even) td { background:#f8fafc; }
  .pill { display:inline-block; padding:1px 8px; border-radius:999px; font-size:9px; font-weight:700; text-transform:capitalize; }
  .card { border:1px solid #e2e8f0; border-radius:6px; padding:10px 12px; margin:8px 0; page-break-inside:avoid; }
  .why { margin:6px 0; padding-left:18px; color:#475569; } .why li { margin:2px 0; }
  .kpi { display:flex; justify-content:space-between; align-items:center; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 16px; font-size:13px; }
  .kpi strong { font-size:18px; color:#1d4ed8; }
  .chips { list-style:none; padding:0; display:flex; flex-wrap:wrap; gap:6px; } .chips li { background:#f1f5f9; border:1px solid #e2e8f0; border-radius:6px; padding:3px 10px; font-size:10.5px; }
  .grid2 { display:grid; grid-template-columns:repeat(2,1fr); gap:8px 20px; margin:8px 0; }
  .grid2 > div { display:flex; flex-direction:column; border-bottom:1px dotted #e2e8f0; padding:4px 0; } .grid2 .k { color:#64748b; font-size:9px; text-transform:uppercase; letter-spacing:.03em; } .grid2 .v { font-weight:600; }
  .approved-note { color:#166534; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:6px 10px; margin-top:8px; }
  .radar-row { display:flex; gap:24px; flex-wrap:wrap; justify-content:center; margin:10px 0 4px; }
  .radar-cell { margin:0; text-align:center; }
  .radar-cell figcaption { font-size:10.5px; font-weight:600; color:#334155; margin-bottom:2px; }
  .ax { display:inline-block; color:#fff; font-size:8px; font-weight:700; padding:1px 6px; border-radius:4px; margin-right:4px; }
  .radar-legend { text-align:center; font-size:10px; color:#64748b; margin:2px 0 8px; }
  .radar-legend .ln { display:inline-block; width:16px; height:0; vertical-align:middle; }
  .radar-legend .dash { border-top:2px dashed #dc2626; } .radar-legend .solid { border-top:3px solid #2563eb; }
  .cap { font-size:9.5px; color:#64748b; text-align:center; margin-top:4px; }
  .footer { margin-top:30px; border-top:1px solid #e2e8f0; padding-top:12px; color:#94a3b8; font-size:10px; text-align:center; }
  @media print { .toolbar { display:none; } .page { max-width:none; } body { font-size:11px; } }
</style></head><body>
  <div class="toolbar"><span>Final QCC Report — ${esc(p.title)}</span><button onclick="window.print()">🖨 Print / Save as PDF</button></div>
  <div class="page">
    <div class="cover">
      <div class="brand">QCC Monitor · Quality Circle Activity</div>
      <h1>Final Project Report</h1>
      <div class="sub">${esc(p.title)}</div>
      <div class="badge ${decCls}">${decision}</div>
      <div class="meta">
        <div><span class="k">Team</span><span class="v">${esc(team?.name || '—')}</span></div>
        <div><span class="k">Department</span><span class="v">${esc(p.department || team?.department || '—')}</span></div>
        <div><span class="k">Team Leader</span><span class="v">${esc(team?.leaderName || '—')}</span></div>
        <div><span class="k">Advisor</span><span class="v">${esc(advisor)}</span></div>
        <div><span class="k">Coordinator</span><span class="v">${esc(team?.coordinatorName || '—')}</span></div>
        <div><span class="k">QCC Period</span><span class="v">${esc(periodLabel || '—')}</span></div>
        <div><span class="k">Annual Saving</span><span class="v">${totalSaving > 0 ? inr(totalSaving) : '—'}</span></div>
        <div><span class="k">Generated</span><span class="v">${esc(generatedAt)}</span></div>
      </div>
    </div>

    ${section('Approval Overview', overview + `<p style="color:#64748b;font-size:10px;margin-top:6px">This report includes detailed data only from <strong>approved</strong> steps.</p>`)}
    ${stepSections}
    ${benefitsHtml}
    ${section('Team Skill Assessment — Radar (Circle Assessment)', teamAssessmentSection())}
    ${section('Advisor Final Approval & Project Closure', closureBody)}

    <div class="footer">QCC Monitor — Final Project Report · Generated ${esc(generatedAt)} · Confidential</div>
  </div>
  <script>window.addEventListener('load', function(){ setTimeout(function(){ try { window.focus(); window.print(); } catch(e){} }, 400); });</script>
</body></html>`;
}

export function openFinalReport(ctx: ReportCtx): boolean {
  const html = buildFinalReportHTML(ctx);
  const w = window.open('', '_blank');
  if (!w) return false;                      // pop-up blocked
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}
