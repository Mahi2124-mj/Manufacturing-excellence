// ─── Fishbone (Ishikawa) Diagram ─────────────────────────
// Dynamic SVG layout. The canvas grows vertically with the tallest column, so adding
// long causes can never make a box overlap the spine, the branches or another box.
// Editable: pass onDeleteCause / onEditCause to allow removing a bone (× button) or
// editing its text in place (click the box).

import { useState } from 'react';
import { X } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────
export type FishboneCategory = 'Man' | 'Machine' | 'Method' | 'Material' | 'Measurement' | 'Environment';

export interface FishboneCause {
  id: string;
  category: FishboneCategory;
  text: string;
  number?: number;
}

interface FishboneDiagramProps {
  causes?: FishboneCause[];
  problemStatement?: string;
  onEditCause?: (id: string, text: string) => void;
  onDeleteCause?: (id: string) => void;
  onToggleSelect?: (id: string) => void;
}

// ─── Layout Constants ────────────────────────────────────
const W = 1400;
const SPINE_X1 = 140;
const SPINE_X2 = 1050;
const ARROW_X = 1110;
const EFF_X = 1140;
const EFF_W = 230;
const EFF_H = 90;
const EFF_HDR = 28;

// Branch attachment points on the spine.
const BR_SPACING = 290;
const BR_X = { env: 380, mach: 380 + BR_SPACING, man: 380 + BR_SPACING * 2 };

// Horizontal offset of the branch tip (smaller = steeper branch).
const DX = 85;

// Vertical anchors. TOP_Y / BOT_Y are the branch tips; the spine sits between them and
// is pushed down as the top columns get taller.
const TOP_Y = 90;
const TOP_START = 120;      // y of the first top cause box
const SPINE_GAP = 55;       // clearance between the lowest top box and the spine
const BOT_OFFSET = 70;      // gap between the spine and the first bottom box
const BOTTOM_PAD = 70;      // clearance below the lowest bottom box

// Cause box dimensions — larger boxes with roomier text.
const BOX_W = 170;
const BOX_PAD = 10;
const FONT = 12;
const LINE_H = 17;
const BOX_GAP = 12;         // vertical space between stacked boxes
const MAX_LINES = 3;        // long text is clamped so a box can never grow unbounded
const CONNECTOR_GAP = 26;   // guaranteed empty space between a box and its branch line

// ─── Category Colors ─────────────────────────────────────
const COLORS: Record<FishboneCategory, string> = {
  Environment: '#06b6d4',
  Machine:     '#10b981',
  Man:         '#3b82f6',
  Measurement: '#ef4444',
  Method:      '#f59e0b',
  Material:    '#8b5cf6',
};

const TOP_CATS: FishboneCategory[] = ['Environment', 'Machine', 'Man'];
const BOT_CATS: FishboneCategory[] = ['Measurement', 'Method', 'Material'];
const BR_FOR: Record<FishboneCategory, number> = {
  Environment: BR_X.env, Measurement: BR_X.env,
  Machine: BR_X.mach,    Method: BR_X.mach,
  Man: BR_X.man,         Material: BR_X.man,
};

// ─── Helpers ─────────────────────────────────────────────
/** Wrap to the box width, clamped to MAX_LINES with an ellipsis on the last line. */
function wrapText(text: string, maxW: number): string[] {
  const usable = maxW - BOX_PAD * 2;
  const charW = FONT * 0.54;
  const maxChars = Math.max(6, Math.floor(usable / charW));
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (test.length <= maxChars) cur = test;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);

  if (lines.length > MAX_LINES) {
    const kept = lines.slice(0, MAX_LINES);
    const last = kept[MAX_LINES - 1];
    kept[MAX_LINES - 1] = last.length > maxChars - 1
      ? `${last.slice(0, Math.max(1, maxChars - 1))}…`
      : `${last}…`;
    return kept;
  }
  return lines;
}

const boxHeightFor = (lines: string[]) =>
  Math.max(36, lines.length * LINE_H + BOX_PAD * 2);

/** x of a branch line at a given y. The branch runs (br, spineY) → (br − DX, tipY). */
const branchXAtY = (br: number, spineY: number, tipY: number, y: number) =>
  br + ((y - spineY) / (tipY - spineY)) * -DX;

// ─── Component ───────────────────────────────────────────
export default function FishboneDiagram({ causes, problemStatement, onEditCause, onDeleteCause, onToggleSelect }: FishboneDiagramProps) {
  const effectText = problemStatement || 'Inconsistent solder paste application volume';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const startEdit = (id: string, text: string) => {
    if (!onEditCause) return;
    setEditingId(id);
    setDraft(text);
  };
  const commitEdit = (id: string, fallback: string) => {
    onEditCause?.(id, draft.trim() || fallback);
    setEditingId(null);
  };

  // ── Group causes by category ──
  const causeMap: Record<FishboneCategory, { id: string; text: string; number?: number }[]> = {
    Environment: [], Machine: [], Man: [],
    Measurement: [], Method: [], Material: [],
  };
  causes?.forEach(c => { if (causeMap[c.category]) causeMap[c.category].push({ id: c.id, text: c.text, number: c.number }); });

  // ── Pre-measure every box so the canvas can size itself ──
  type Measured = { id: string; text: string; lines: string[]; bh: number; number?: number };
  const measured: Record<FishboneCategory, Measured[]> = {
    Environment: [], Machine: [], Man: [], Measurement: [], Method: [], Material: [],
  };
  (Object.keys(causeMap) as FishboneCategory[]).forEach(cat => {
    measured[cat] = causeMap[cat].map(({ id, text, number }) => {
      const lines = wrapText(text, BOX_W);
      return { id, text, lines, bh: boxHeightFor(lines), number };
    });
  });

  const colHeight = (cat: FishboneCategory) => {
    const items = measured[cat];
    if (items.length === 0) return 0;
    return items.reduce((s, m) => s + m.bh, 0) + (items.length - 1) * BOX_GAP;
  };

  const maxTopH = Math.max(0, ...TOP_CATS.map(colHeight));
  const maxBotH = Math.max(0, ...BOT_CATS.map(colHeight));

  // ── Dynamic vertical geometry ──
  const SPINE_Y = Math.max(360, TOP_START + maxTopH + SPINE_GAP);
  const BOT_START = SPINE_Y + BOT_OFFSET;
  const H = Math.max(700, BOT_START + maxBotH + BOTTOM_PAD);
  const BOT_Y = H - 80;
  const EFF_Y = SPINE_Y - EFF_H / 2;

  const BRANCH_DEFS = [
    ...TOP_CATS.map(cat => ({ cat, x1: BR_FOR[cat], y1: SPINE_Y, x2: BR_FOR[cat] - DX, y2: TOP_Y })),
    ...BOT_CATS.map(cat => ({ cat, x1: BR_FOR[cat], y1: SPINE_Y, x2: BR_FOR[cat] - DX, y2: BOT_Y })),
  ];

  // ── Column x positions, derived from the branch so CONNECTOR_GAP is guaranteed ──
  const topBase = (cat: FishboneCategory) =>
    branchXAtY(BR_FOR[cat], SPINE_Y, TOP_Y, TOP_START + 14) - BOX_W - CONNECTOR_GAP;
  const botBase = (cat: FishboneCategory) =>
    branchXAtY(BR_FOR[cat], SPINE_Y, BOT_Y, BOT_START + Math.max(colHeight(cat), 36) - 14)
      - BOX_W - CONNECTOR_GAP;

  // ── Lay the boxes out ──
  interface BoxLayout {
    id: string; cat: FishboneCategory; color: string; lines: string[]; text: string; number?: number;
    bx: number; by: number; bw: number; bh: number;
    connX1: number; connY1: number; connX2: number; connY2: number;
  }
  const boxes: BoxLayout[] = [];

  const layoutColumn = (cat: FishboneCategory, startY: number, baseX: number, tipY: number) => {
    let y = startY;
    measured[cat].forEach(m => {
      const cy = y + m.bh / 2;
      boxes.push({
        id: m.id, cat, color: COLORS[cat], lines: m.lines, text: m.text, number: m.number,
        bx: baseX, by: y, bw: BOX_W, bh: m.bh,
        connX1: baseX + BOX_W, connY1: cy,
        connX2: branchXAtY(BR_FOR[cat], SPINE_Y, tipY, cy), connY2: cy,
      });
      y += m.bh + BOX_GAP;
    });
  };

  TOP_CATS.forEach(cat => layoutColumn(cat, TOP_START, topBase(cat), TOP_Y));
  BOT_CATS.forEach(cat => layoutColumn(cat, BOT_START, botBase(cat), BOT_Y));

  return (
    <div className="w-full">
      <div className="w-full rounded-xl overflow-hidden border border-slate-200 bg-white">
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block' }}
        >
          <defs>
            <filter id="fb-box-shadow" x="-5%" y="-5%" width="110%" height="115%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.06" />
            </filter>
            <filter id="fb-eff-shadow" x="-5%" y="-5%" width="110%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#1e40af" floodOpacity="0.15" />
            </filter>
            <filter id="fb-pill-shadow" x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.1" />
            </filter>
          </defs>

          {/* ── Background ── */}
          <rect x="0" y="0" width={W} height={H} fill="#f8fafc" />

          {/* ── Main Spine ── */}
          <line
            x1={SPINE_X1} y1={SPINE_Y}
            x2={SPINE_X2} y2={SPINE_Y}
            stroke="#2563eb" strokeWidth="3.5" strokeLinecap="round"
          />

          {/* ── Fish Tail ── */}
          <line x1={SPINE_X1} y1={SPINE_Y} x2={80} y2={SPINE_Y - 60}
            stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
          <line x1={SPINE_X1} y1={SPINE_Y} x2={80} y2={SPINE_Y + 60}
            stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
          <path
            d={`M 80 ${SPINE_Y - 60} Q 55 ${SPINE_Y} 80 ${SPINE_Y + 60}`}
            stroke="#2563eb" strokeWidth="2.5" fill="none" strokeLinecap="round"
          />

          {/* ── Arrow Head ── */}
          <polygon
            points={`${SPINE_X2},${SPINE_Y - 20} ${ARROW_X},${SPINE_Y} ${SPINE_X2},${SPINE_Y + 20}`}
            fill="#2563eb"
          />

          {/* ── Branch Lines ── */}
          {BRANCH_DEFS.map(({ cat, x1, y1, x2, y2 }) => (
            <line
              key={`br-${cat}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={COLORS[cat]} strokeWidth="2.5" strokeLinecap="round"
            />
          ))}

          {/* ── Category Labels (Pills) ── */}
          {BRANCH_DEFS.map(({ cat, x2, y2 }) => {
            const pillW = 94;
            const pillH = 24;
            const pillY = y2 - pillH / 2;
            return (
              <g key={`lbl-${cat}`}>
                <rect
                  x={x2 - pillW / 2} y={pillY}
                  width={pillW} height={pillH} rx={pillH / 2}
                  fill={COLORS[cat]}
                  filter="url(#fb-pill-shadow)"
                />
                <text
                  x={x2} y={pillY + pillH / 2 + 1}
                  textAnchor="middle" dominantBaseline="central"
                  fill="white" fontSize="11" fontWeight="700"
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  {cat}
                </text>
              </g>
            );
          })}

          {/* ── Connector Lines (dotted) ── */}
          {boxes.map((c, i) => (
            <line
              key={`conn-${i}`}
              x1={c.connX1} y1={c.connY1}
              x2={c.connX2} y2={c.connY2}
              stroke={c.color} strokeWidth="1.2"
              strokeDasharray="4,3" opacity="0.55"
            />
          ))}

          {/* ── Cause Boxes ── */}
          {boxes.map((c, i) => {
            const isEditing = editingId === c.id;
            return (
              <g key={`box-${i}`}>
                <rect
                  x={c.bx} y={c.by}
                  width={c.bw} height={c.bh}
                  rx={8} fill="white"
                  stroke={c.color} strokeWidth="1.5"
                  filter="url(#fb-box-shadow)"
                  onClick={() => !isEditing && startEdit(c.id, c.text)}
                  style={{ cursor: onEditCause && !isEditing ? 'text' : 'default' }}
                >
                  {onEditCause && !isEditing && <title>Click to edit</title>}
                </rect>

                {/* Selected → numbered badge (click to unselect); otherwise a "+" select button */}
                {c.number != null ? (
                  <g onClick={e => { e.stopPropagation(); onToggleSelect?.(c.id); }} style={{ cursor: onToggleSelect ? 'pointer' : 'default' }}>
                    <circle cx={c.bx} cy={c.by} r="9.5" fill={c.color} stroke="white" strokeWidth="1.5" />
                    <text
                      x={c.bx} y={c.by + 0.5}
                      textAnchor="middle" dominantBaseline="central"
                      fill="white" fontSize="10" fontWeight="700"
                      style={{ pointerEvents: 'none' }}
                      fontFamily="Inter, system-ui, sans-serif"
                    >
                      {c.number}
                    </text>
                    <title>Click to unselect (stays on the chart)</title>
                  </g>
                ) : onToggleSelect ? (
                  <foreignObject x={c.bx - 9} y={c.by - 9} width="18" height="18">
                    <button
                      onClick={e => { e.stopPropagation(); onToggleSelect(c.id); }}
                      title="Select this problem"
                      style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px dashed ${c.color}`, background: 'white', color: c.color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: 13, fontWeight: 700, lineHeight: 1 }}
                    >
                      +
                    </button>
                  </foreignObject>
                ) : null}

                {isEditing ? (
                  <foreignObject x={c.bx} y={c.by} width={c.bw} height={c.bh}>
                    <input
                      autoFocus
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onBlur={() => commitEdit(c.id, c.text)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitEdit(c.id, c.text);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      style={{
                        width: '100%', height: '100%', boxSizing: 'border-box',
                        border: `1.5px solid ${c.color}`, borderRadius: 8,
                        padding: '4px 8px', fontSize: FONT, color: '#334155',
                        outline: 'none', fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500,
                      }}
                    />
                  </foreignObject>
                ) : (
                  <>
                    {c.lines.map((line, li) => (
                      <text
                        key={li}
                        x={c.bx + BOX_PAD}
                        y={c.by + BOX_PAD + FONT + li * LINE_H}
                        fontSize={FONT}
                        fill="#334155"
                        fontFamily="Inter, system-ui, sans-serif"
                        fontWeight="500"
                        style={{ pointerEvents: 'none' }}
                      >
                        {line}
                      </text>
                    ))}

                    {/* Delete (×) — top-right. Editing is done by clicking the box text. */}
                    {onDeleteCause && (
                      <foreignObject x={c.bx + c.bw - 21} y={c.by + 2} width="19" height="19">
                        <button
                          onClick={e => { e.stopPropagation(); onDeleteCause(c.id); }}
                          title="Delete cause"
                          aria-label="Delete cause"
                          style={{
                            width: 19, height: 19, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: 'none', background: '#ef4444', borderRadius: '50%', color: 'white', cursor: 'pointer', padding: 0,
                          }}
                        >
                          <X size={11} />
                        </button>
                      </foreignObject>
                    )}
                  </>
                )}
              </g>
            );
          })}

          {/* ── Effect / Problem Box ── */}
          <g>
            <rect
              x={EFF_X} y={EFF_Y}
              width={EFF_W} height={EFF_H}
              rx={10} fill="white"
              stroke="#2563eb" strokeWidth="2.5"
              filter="url(#fb-eff-shadow)"
            />
            <rect
              x={EFF_X} y={EFF_Y}
              width={EFF_W} height={EFF_HDR}
              rx={10} fill="#2563eb"
            />
            <rect
              x={EFF_X} y={EFF_Y + EFF_HDR - 10}
              width={EFF_W} height={10}
              fill="#2563eb"
            />
            <text
              x={EFF_X + EFF_W / 2}
              y={EFF_Y + EFF_HDR / 2 + 1}
              textAnchor="middle" dominantBaseline="central"
              fill="white" fontSize="10" fontWeight="800"
              fontFamily="Inter, system-ui, sans-serif"
              letterSpacing="0.8"
            >
              EFFECT / PROBLEM
            </text>
            <foreignObject
              x={EFF_X + 12}
              y={EFF_Y + EFF_HDR + 4}
              width={EFF_W - 24}
              height={EFF_H - EFF_HDR - 8}
            >
              <div
                style={{
                  fontSize: '13px',
                  color: '#1e293b',
                  textAlign: 'center',
                  lineHeight: '1.35',
                  fontWeight: 600,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  overflow: 'hidden',
                }}
              >
                {effectText}
              </div>
            </foreignObject>
          </g>
        </svg>
      </div>
    </div>
  );
}
