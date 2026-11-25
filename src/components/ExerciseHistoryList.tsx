import { useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import { formatSessionDate, historySessions } from '../data/exerciseHistory';
import { formatSetLine } from '../data/progression';
import type { Workout, WorkoutSet } from '../data/types';
import './ExerciseHistoryList.css';

const PAGE = 20;

/** Past sessions of one exercise, newest first: a header per session and one numbered row per set. */
export default function ExerciseHistoryList({
  history,
  pageSize = PAGE,
}: {
  history: { workout: Workout; sets: WorkoutSet[] }[];
  pageSize?: number;
}) {
  const [shown, setShown] = useState(pageSize);
  const [now] = useState(() => Date.now());
  const sessions = useMemo(() => historySessions(history), [history]);
  if (sessions.length === 0) return <p className="info-empty">Brak wcześniejszych treningów z tym ćwiczeniem.</p>;
  const left = sessions.length - shown;
  return (
    <>
      <ul className="xhist" aria-label="Historia ćwiczenia">
        {sessions.slice(0, shown).map(({ workout, rows }) => (
          <li key={workout.id} className="xhist__session">
            <p className="xhist__head">
              <span className="xhist__date">{formatSessionDate(workout.startedAt, now)}</span>
              <span className="xhist__day">{workout.name}</span>
            </p>
            <ol className="xhist__sets" aria-label={`Serie: ${formatSessionDate(workout.startedAt, now)}`}>
              {rows.map((r) => {
                const meta = [r.warmup ? 'Rozgrzewka' : null, r.rpe ?? null].filter(Boolean).join(' · ');
                return (
                  <li key={r.id} className={r.warmup ? 'xhist__set xhist__set--warm' : 'xhist__set'}>
                    <span className="xhist__n" aria-hidden="true">{r.n}</span>
                    <span className="xhist__body">
                      <span className="xhist__main">
                        {formatSetLine(r)}
                        {r.record && (
                          <Trophy size={15} className="xhist__trophy" aria-label="rekord" role="img" />
                        )}
                      </span>
                      {meta && <span className="xhist__meta">{meta}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ul>
      {left > 0 && (
        <button type="button" className="xhist__more" onClick={() => setShown((s) => s + pageSize)}>
          Pokaż starsze ({left})
        </button>
      )}
    </>
  );
}
