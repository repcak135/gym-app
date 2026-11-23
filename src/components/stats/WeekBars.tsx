import { useState } from 'react';

const SHORT_MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const W = 320;
const H = 120;
const AXIS = 16; // room for month labels under the bars
const TOP = 14;

function workoutsLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return '1 trening';
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${n} treningi`;
  return `${n} treningów`;
}

function weekLabel(start: number): string {
  const a = new Date(start);
  const b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6);
  const left = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()} ${SHORT_MONTHS[a.getMonth()]}`;
  return `${left}–${b.getDate()} ${SHORT_MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

/** Workouts per week as thin bars; tap a bar to read its week. */
export default function WeekBars({ weeks }: { weeks: { weekStart: number; count: number }[] }) {
  const [sel, setSel] = useState<number | null>(null);
  if (weeks.length === 0) return null;
  const max = Math.max(3, ...weeks.map((w) => w.count));
  const slot = W / weeks.length;
  const gap = Math.min(2, slot * 0.25);
  const barW = Math.max(slot - gap, 0.5);
  const plotH = H - AXIS - TOP;
  const avg = weeks.reduce((a, w) => a + w.count, 0) / weeks.length;
  // Month ticks: every month for short ranges, every quarter for a year+, January only for long history.
  const every = weeks.length <= 16 ? 1 : weeks.length <= 60 ? 3 : 12;
  const ticks: { x: number; text: string }[] = [];
  weeks.forEach((w, i) => {
    const d = new Date(w.weekStart);
    const prev = i > 0 ? new Date(weeks[i - 1].weekStart) : null;
    const monthChanged = !prev || prev.getMonth() !== d.getMonth();
    if (monthChanged && d.getMonth() % every === 0) {
      const text = every === 12 ? String(d.getFullYear()) : SHORT_MONTHS[d.getMonth()];
      if (i === 0 && every === 3 && d.getDate() > 7) return; // partial first month: skip, avoids crowding
      ticks.push({ x: i * slot, text });
    }
  });
  const selected = sel !== null ? weeks[sel] : null;
  const avgY = TOP + plotH - (avg / max) * plotH;
  return (
    <div className="weekbars">
      <svg viewBox={`0 0 ${W} ${H}`} className="weekbars__svg" role="img" aria-label={`Treningi w tygodniu, średnio ${avg.toFixed(1).replace('.', ',')} na tydzień`}>
        {[...Array(max + 1).keys()]
          .filter((v) => v > 0 && (max <= 4 || v % 2 === 0))
          .map((v) => {
            const y = TOP + plotH - (v / max) * plotH;
            return (
              <g key={v}>
                <line x1="0" x2={W} y1={y} y2={y} className="weekbars__grid" />
                <text x={W} y={y - 2} textAnchor="end" className="weekbars__tick">
                  {v}
                </text>
              </g>
            );
          })}
        {weeks.map((w, i) => {
          const h = (w.count / max) * plotH;
          const x = i * slot + gap / 2;
          return (
            <g key={w.weekStart} onClick={() => setSel(sel === i ? null : i)} style={{ cursor: 'pointer' }}>
              <rect x={i * slot} y={TOP} width={slot} height={plotH} fill="transparent" />
              {w.count > 0 && (
                <rect
                  x={x}
                  y={TOP + plotH - h}
                  width={barW}
                  height={h}
                  rx={Math.min(2, barW / 2)}
                  className={sel === i ? 'weekbars__bar weekbars__bar--sel' : 'weekbars__bar'}
                />
              )}
            </g>
          );
        })}
        <line x1="0" x2={W} y1={avgY} y2={avgY} className="weekbars__avg" />
        <line x1="0" x2={W} y1={TOP + plotH} y2={TOP + plotH} className="weekbars__base" />
        {ticks.map((t) => (
          <text key={t.x} x={t.x + 1} y={H - 3} className="weekbars__tick">
            {t.text}
          </text>
        ))}
      </svg>
      <p className="weekbars__caption" aria-live="polite">
        {selected
          ? `${weekLabel(selected.weekStart)}: ${workoutsLabel(selected.count)}`
          : `Średnio ${avg.toFixed(1).replace('.', ',')} / tydzień (przerywana linia)`}
      </p>
    </div>
  );
}
