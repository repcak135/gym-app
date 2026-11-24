import { formatKg } from '../../data/progression';
import './MiniChart.css';

interface Point {
  label: string;
  a: number;
  b: number;
}

interface Props {
  points: Point[];
  labelA: string;
  labelB: string;
}

const W = 320;
const H = 160;
const PAD = { l: 34, r: 10, t: 10, b: 22 };

/** Two-line chart in plain SVG (no chart library needed for this one view). */
export default function MiniChart({ points, labelA, labelB }: Props) {
  const values = points.flatMap((p) => [p.a, p.b]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const lo = Math.max(0, Math.floor((min - (max - min) * 0.1 - 1) / 5) * 5);
  const hi = Math.ceil((max + (max - min) * 0.1 + 1) / 5) * 5;
  const x = (i: number) => PAD.l + (points.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (points.length - 1));
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const path = (key: 'a' | 'b') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const labelEvery = Math.max(1, Math.ceil(points.length / 5));

  return (
    <figure className="mini-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Wykres: ${labelA} i ${labelB}`}>
        {[lo, (lo + hi) / 2, hi].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="mini-chart__grid" />
            <text x={PAD.l - 4} y={y(v) + 4} textAnchor="end" className="mini-chart__axis">{formatKg(Math.round(v))}</text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="mini-chart__axis">{p.label}</text>
          ) : null,
        )}
        <path d={path('b')} className="mini-chart__line mini-chart__line--b" />
        <path d={path('a')} className="mini-chart__line mini-chart__line--a" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.b)} r={3} className="mini-chart__dot--b" />
            <circle cx={x(i)} cy={y(p.a)} r={3} className="mini-chart__dot--a" />
          </g>
        ))}
      </svg>
      <figcaption className="mini-chart__legend">
        <span><i className="mini-chart__key mini-chart__key--a" />{labelA}</span>
        <span><i className="mini-chart__key mini-chart__key--b" />{labelB}</span>
      </figcaption>
    </figure>
  );
}
