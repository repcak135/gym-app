import { useMemo, useState } from 'react';
import { BODY_PART_LABEL, type BodyPart } from '../../data/muscleMap';
import { ANTERIOR, POSTERIOR, type BodyPolygon } from './bodyPolygons';
import './BodyMap.css';

type Mode = 'sets' | 'days';

interface Props {
  values: Partial<Record<BodyPart, number>>;
  mode: Mode;
}

interface Group {
  part: BodyPart | null; // null = decorative (head, knees)
  points: string[];
}

function groupPolygons(polys: BodyPolygon[]): Group[] {
  const groups: Group[] = [];
  const byPart = new Map<BodyPart, Group>();
  for (const p of polys) {
    if (p.part === 'head' || p.part === 'knees') {
      groups.push({ part: null, points: p.points });
      continue;
    }
    const part: BodyPart = p.part === 'left-soleus' || p.part === 'right-soleus' ? 'calves' : p.part;
    let g = byPart.get(part);
    if (!g) {
      g = { part, points: [] };
      byPart.set(part, g);
      groups.push(g);
    }
    g.points.push(...p.points);
  }
  return groups;
}

const FRONT = groupPolygons(ANTERIOR);
const BACK = groupPolygons(POSTERIOR);

function setsStep(value: number, max: number): number {
  if (!(value > 0) || !(max > 0)) return -1;
  const ratio = value / max;
  if (ratio <= 0.25) return 0;
  if (ratio <= 0.5) return 1;
  if (ratio <= 0.75) return 2;
  return 3;
}

function daysBucket(days: number | undefined): 0 | 1 | 2 | 3 {
  if (days === undefined || !Number.isFinite(days)) return 3;
  if (days <= 3) return 0;
  if (days <= 7) return 1;
  if (days <= 14) return 2;
  return 3;
}

function setsWord(n: number): string {
  if (n === 1) return 'seria';
  const last = n % 10;
  const last2 = n % 100;
  if (last >= 2 && last <= 4 && !(last2 >= 12 && last2 <= 14)) return 'serie';
  return 'serii';
}

function daysText(days: number | undefined): string {
  if (days === undefined || !Number.isFinite(days)) return 'nigdy';
  const d = Math.round(days);
  if (d <= 0) return 'dziś';
  if (d === 1) return 'wczoraj';
  return `${d} dni temu`;
}

const DAYS_LEGEND = ['do 3 dni', '4–7 dni', '8–14 dni', 'ponad 14 dni / nigdy'];
const SET_SWATCHES = [0, 1, 2, 3];

export default function BodyMap({ values, mode }: Props) {
  const [selected, setSelected] = useState<BodyPart | null>(null);

  const max = useMemo(() => {
    let m = 0;
    for (const v of Object.values(values)) if (typeof v === 'number' && v > m) m = v;
    return m;
  }, [values]);

  function fillClass(part: BodyPart | null): string {
    if (part === null) return 'bodymap__shape';
    if (mode === 'sets') {
      const step = setsStep(values[part] ?? 0, max);
      return step < 0 ? 'bodymap__shape' : `bodymap__shape bodymap__shape--set${step}`;
    }
    return `bodymap__shape bodymap__shape--day${daysBucket(values[part])}`;
  }

  function summary(): string {
    if (selected === null) return 'Dotknij mięśnia, żeby zobaczyć szczegóły';
    const label = BODY_PART_LABEL[selected];
    if (mode === 'sets') {
      const n = Math.round(values[selected] ?? 0);
      return `${label}: ${n} ${setsWord(n)}`;
    }
    return `${label}: ${daysText(values[selected])}`;
  }

  function renderFigure(groups: Group[], caption: string) {
    return (
      <figure className="bodymap__figure">
        <svg className="bodymap__svg" viewBox="0 0 100 200" focusable="false">
          {groups.map((g, gi) => {
            const polys = g.points.map((pts, i) => (
              <polygon key={i} className={fillClass(g.part)} points={pts} />
            ));
            if (g.part === null) return <g key={gi}>{polys}</g>;
            const part = g.part;
            return (
              <g
                key={gi}
                role="button"
                tabIndex={0}
                aria-label={BODY_PART_LABEL[part]}
                aria-pressed={selected === part}
                className={`bodymap__muscle${selected === part ? ' bodymap__muscle--selected' : ''}`}
                onClick={() => setSelected(part)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(part);
                  }
                }}
              >
                {polys}
              </g>
            );
          })}
        </svg>
        <figcaption className="bodymap__caption">{caption}</figcaption>
      </figure>
    );
  }

  return (
    <div className="bodymap" aria-label="Sylwetka">
      <div className="bodymap__figures">
        {renderFigure(FRONT, 'Przód')}
        {renderFigure(BACK, 'Tył')}
      </div>
      <p className="bodymap__summary" aria-live="polite">
        {summary()}
      </p>
      {mode === 'sets' ? (
        <div className="bodymap__legend">
          <span>mniej</span>
          {SET_SWATCHES.map((i) => (
            <span key={i} className={`bodymap__swatch bodymap__swatch--set${i}`} />
          ))}
          <span>więcej</span>
        </div>
      ) : (
        <div className="bodymap__legend bodymap__legend--days">
          {DAYS_LEGEND.map((label, i) => (
            <span key={label} className="bodymap__legend-item">
              <span className={`bodymap__swatch bodymap__swatch--day${i}`} />
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
