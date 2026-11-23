import { useState } from 'react';

const W = 320;
const H = 150;
const LEFT = 4;
const RIGHT = 34; // room for y labels on the right
const TOP = 10;
const BOTTOM = 18;
const SHORT_MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

export interface LinePoint {
  at: number;
  date: string;
  value: number;
}

function fmt(v: number): string {
  return (Math.round(v * 10) / 10).toString().replace('.', ',');
}

function dayLabel(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** One metric over time: 2px line, 8px dots; tap a dot to read its date and value. */
export default function LineChart({
  points,
  unit,
  start,
  end,
  label,
}: {
  points: LinePoint[];
  unit: string;
  start: number;
  end: number;
  label: string;
}) {
  const [sel, setSel] = useState<number | null>(null);
  if (points.length === 0) return null;
  const values = points.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.15, hi * 0.01, 0.5);
  lo -= pad;
  hi += pad;
  const t0 = Math.min(start, points[0].at);
  const t1 = Math.max(end, points[points.length - 1].at + 1);
  const plotW = W - LEFT - RIGHT;
  const plotH = H - TOP - BOTTOM;
  const x = (t: number) => LEFT + ((t - t0) / (t1 - t0)) * plotW;
  const y = (v: number) => TOP + plotH - ((v - lo) / (hi - lo)) * plotH;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const selected = sel !== null ? points[sel] : null;
  const last = points[points.length - 1];
  return (
    <div className="linechart">
      <svg viewBox={`0 0 ${W} ${H}`} className="linechart__svg" role="img" aria-label={label}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={LEFT} x2={LEFT + plotW} y1={y(v)} y2={y(v)} className="weekbars__grid" />
            <text x={W} y={y(v) + 3} textAnchor="end" className="weekbars__tick">
              {fmt(v)}
            </text>
          </g>
        ))}
        <text x={LEFT} y={H - 4} className="weekbars__tick">
          {dayLabel(t0)}
        </text>
        <text x={LEFT + plotW} y={H - 4} textAnchor="end" className="weekbars__tick">
          {dayLabel(end - 1)}
        </text>
        {points.length > 1 && <path d={path} className="linechart__line" />}
        {points.map((p, i) => (
          <g key={i} onClick={() => setSel(sel === i ? null : i)} style={{ cursor: 'pointer' }}>
            <circle cx={x(p.at)} cy={y(p.value)} r={12} fill="transparent" />
            <circle
              cx={x(p.at)}
              cy={y(p.value)}
              r={sel === i ? 5 : 4}
              className={sel === i ? 'linechart__dot linechart__dot--sel' : 'linechart__dot'}
            />
          </g>
        ))}
      </svg>
      <p className="weekbars__caption" aria-live="polite">
        {selected
          ? `${dayLabel(selected.at)}: ${fmt(selected.value)} ${unit}`
          : `Ostatnio ${dayLabel(last.at)}: ${fmt(last.value)} ${unit} · dotknij punktu`}
      </p>
    </div>
  );
}
