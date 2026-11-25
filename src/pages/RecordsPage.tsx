import { useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Award, ChevronRight, Lock } from 'lucide-react';
import { db } from '../data/db';
import { computeBadges, exerciseBests } from '../data/badges';
import { clampGoal } from '../data/motivation';
import { getSettings } from '../data/settings';
import { loadStatsInput } from '../data/stats';
import { formatDistance, formatDuration } from '../data/measure';
import { formatKg } from '../data/progression';
import Segmented from '../components/stats/Segmented';
import { formatDay } from './planFormat';
import './PlansPage.css';
import './StatsPage.css';
import './RecordsPage.css';

let lastTab: 'badges' | 'records' = 'badges';

/** Statystyki › Rekordy i odznaki: badges earned from history and per-exercise bests. */
export default function RecordsPage() {
  const [now] = useState(() => Date.now());
  const [tab, setTab] = useState(lastTab);
  const data = useLiveQuery(async () => {
    const [input, settings] = await Promise.all([loadStatsInput(), getSettings()]);
    const bests = exerciseBests(input);
    const exercises = await db.exercises.bulkGet(bests.map((b) => b.exerciseId));
    return {
      badges: computeBadges(input, clampGoal(settings.weeklyGoal), now),
      bests: bests.map((b, i) => ({ ...b, name: exercises[i]?.name ?? 'Nieznane ćwiczenie' })),
    };
  }, [now]);
  const earned = data ? data.badges.filter((b) => b.earnedAt !== undefined).length : 0;

  return (
    <article className="recs">
      <Link to="/statystyki" className="plan-back" aria-label="Wróć do statystyk">
        <ArrowLeft size={18} aria-hidden="true" />
        Statystyki
      </Link>
      <h1>Rekordy i odznaki</h1>
      <Segmented
        label="Rekordy i odznaki"
        options={[
          { key: 'badges', label: 'Odznaki' },
          { key: 'records', label: 'Rekordy' },
        ]}
        value={tab}
        onChange={(t) => {
          lastTab = t;
          setTab(t);
        }}
      />
      {!data ? (
        <p className="stats-muted">Wczytywanie…</p>
      ) : tab === 'badges' ? (
        <>
          <p className="recs__count">
            Zdobyte: {earned} z {data.badges.length}
          </p>
          <ul className="badges" aria-label="Odznaki">
            {data.badges.map((b) => {
              const on = b.earnedAt !== undefined;
              return (
                <li
                  key={b.id}
                  className={on ? 'badge badge--on' : 'badge'}
                  aria-label={`${b.title}, ${on ? 'zdobyta' : 'zablokowana'}`}
                >
                  <span className="badge__icon" aria-hidden="true">
                    {on ? <Award size={26} /> : <Lock size={22} />}
                  </span>
                  <strong className="badge__title">{b.title}</strong>
                  <span className="badge__desc">{b.description}</span>
                  {on ? (
                    <span className="badge__meta">zdobyta {formatDay(b.earnedAt!)}</span>
                  ) : (
                    b.progress && (
                      <span className="badge__meta">
                        <span className="badge__bar" aria-hidden="true">
                          <span style={{ transform: `scaleX(${b.progress.current / b.progress.target})` }} />
                        </span>
                        {b.progress.current}/{b.progress.target}
                      </span>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : data.bests.length === 0 ? (
        <p className="stats-muted">Brak rekordów — zrób pierwszy trening.</p>
      ) : (
        <ul className="bests" aria-label="Rekordy ćwiczeń">
          {data.bests.map((b) => (
            <li key={b.exerciseId}>
              <Link to={`/cwiczenia/${b.exerciseId}`} className="bests__row">
                <span className="bests__body">
                  <strong>{b.name}</strong>
                  <span>
                    Najcięższa: {formatKg(b.records.heaviest.weight)} kg × {b.records.heaviest.reps}
                    <small> · {formatDay(b.records.heaviest.at)}</small>
                  </span>
                  <span>
                    1RM: {formatKg(b.records.e1rm.value)} kg
                    <small> · {formatDay(b.records.e1rm.at)}</small>
                  </span>
                  {b.records.longestTime && (
                    <span>
                      Najdłużej: {formatDuration(b.records.longestTime.sec)}
                      <small> · {formatDay(b.records.longestTime.at)}</small>
                    </span>
                  )}
                  {b.records.longestDistance && (
                    <span>
                      Najdalej: {formatDistance(b.records.longestDistance.m, 'timeDistance')}
                      <small> · {formatDay(b.records.longestDistance.at)}</small>
                    </span>
                  )}
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
