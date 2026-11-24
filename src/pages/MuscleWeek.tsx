import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadStatsInput, periodRange } from '../data/stats';
import { BAND_MAX, BAND_MIN, muscleWeek, weekStartOf, type MuscleStatus } from '../data/motivation';
import { setsLabel } from '../data/plural';
import Segmented from '../components/stats/Segmented';
import './MuscleWeek.css';

/** Bar scale: the 10–20 band sits in the middle, anything above 25 fills the bar. */
const SCALE = 25;

const STATUS: Record<MuscleStatus, string> = { low: 'za mało', ok: '✓', high: 'dużo' };

const fmt = (n: number) => String(n).replace('.', ',');

let lastWeek: 'this' | 'last' = 'this';

/** Statystyki › Tydzień: working sets per muscle group against the 10–20 sets/week band. */
export default function MuscleWeek() {
  const input = useLiveQuery(() => loadStatsInput(), []);
  const [now] = useState(() => Date.now());
  const [which, setWhich] = useState(lastWeek);
  const offset = which === 'this' ? 0 : -1;
  const label = periodRange('week', offset, now).label;
  const data = useMemo(() => (input ? muscleWeek(input, weekStartOf(now, offset)) : null), [input, now, offset]);

  return (
    <>
      <Segmented
        label="Który tydzień"
        options={[
          { key: 'this', label: 'Ten tydzień' },
          { key: 'last', label: 'Poprzedni' },
        ]}
        value={which}
        onChange={(v) => {
          lastWeek = v;
          setWhich(v);
        }}
      />
      <h2 className="mweek__label">{label}</h2>
      {!data ? (
        <p className="stats-muted">Wczytywanie…</p>
      ) : (
        <section className="stats-card" aria-labelledby="mweek-title">
          <div className="stats-card__head">
            <h2 id="mweek-title">Serie na mięsień</h2>
          </div>
          <p className="stats-note">Zalecane {BAND_MIN}–{BAND_MAX} serii roboczych na mięsień w tygodniu.</p>
          <ul className="mweek" aria-label="Serie na mięsień w tygodniu">
            {data.rows.map((r) => (
              <li key={r.group} className={`mweek__row mweek__row--${r.status}`}>
                <span className="mweek__name">{r.label}</span>
                <span className="mweek__val" aria-label={`${r.label}: ${fmt(r.sets)} serii, ${STATUS[r.status]}`}>
                  {fmt(r.sets)}
                </span>
                <span className="mweek__status" aria-hidden="true">{STATUS[r.status]}</span>
                <span className="mweek__bar" aria-hidden="true">
                  <span
                    className="mweek__band"
                    style={{ left: `${(BAND_MIN / SCALE) * 100}%`, width: `${((BAND_MAX - BAND_MIN) / SCALE) * 100}%` }}
                  />
                  <span className="mweek__fill" style={{ transform: `scaleX(${Math.min(1, r.sets / SCALE)})` }} />
                </span>
              </li>
            ))}
          </ul>
          {data.unmapped > 0 && (
            <p className="stats-note">
              {setsLabel(data.unmapped)} bez przypisanych mięśni (własne ćwiczenia — uzupełnisz je w karcie ćwiczenia)
            </p>
          )}
          <p className="stats-note">
            Rozgrzewki się nie liczą. Mięsień główny ćwiczenia liczy się całą serią, pomocniczy połową (½).
          </p>
        </section>
      )}
    </>
  );
}
