export interface DonutSlice {
  key: string;
  label: string;
  color: string;
  value: number;
}

const R = 42;
const STROKE = 16;
const C = 2 * Math.PI * R;
const GAP = 1.6; // surface gap between segments, in px along the ring

/** Hand-made SVG donut; slices stay in their fixed (group) order so colours never move. */
export default function DonutChart({
  slices,
  centerValue,
  centerLabel,
  selected,
  onSelect,
}: {
  slices: DonutSlice[];
  centerValue: string;
  centerLabel: string;
  selected?: string | null;
  onSelect?: (key: string | null) => void;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const visible = slices.filter((s) => s.value > 0);
  const starts = visible.map((_, i) =>
    visible.slice(0, i).reduce((a, s) => a + (s.value / (total || 1)) * C, 0),
  );
  return (
    <svg className="donut" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-2)" strokeWidth={STROKE} />
      {total > 0 &&
        visible.map((s, i) => {
          const len = (s.value / total) * C;
          const gap = visible.length > 1 ? Math.min(GAP, len / 2) : 0;
          const dash = Math.max(len - gap, 0.01);
          const el = (
            <circle
              key={s.key}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={selected === s.key ? STROKE + 4 : STROKE}
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-starts[i]}
              opacity={selected && selected !== s.key ? 0.35 : 1}
              transform="rotate(-90 50 50)"
              onClick={() => onSelect?.(selected === s.key ? null : s.key)}
              style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
            />
          );
          return el;
        })}
      <text x="50" y="49" textAnchor="middle" className="donut__value">
        {centerValue}
      </text>
      <text x="50" y="61" textAnchor="middle" className="donut__label">
        {centerLabel}
      </text>
    </svg>
  );
}
