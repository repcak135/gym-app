import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { db } from '../../data/db';
import { saveNote } from '../../data/exercises';
import { getExerciseHistory } from '../../data/workouts';
import { epley1RM, formatKg } from '../../data/progression';
import type { Workout, WorkoutSet } from '../../data/types';
import MiniChart from './MiniChart';
import { formatDay } from '../../pages/planFormat';

export type InfoTab = 'historia' | 'notatki' | 'statystyki';

interface Props {
  exerciseId: string;
  exerciseName: string;
  workoutId: string;
  tab: InfoTab;
  onTab: (tab: InfoTab) => void;
  onClose: () => void;
}

const TABS: { id: InfoTab; label: string }[] = [
  { id: 'historia', label: 'Historia' },
  { id: 'notatki', label: 'Notatki' },
  { id: 'statystyki', label: 'Statystyki' },
];

function History({ history }: { history: { workout: Workout; sets: WorkoutSet[] }[] }) {
  if (history.length === 0) return <p className="info-empty">Brak wcześniejszych treningów z tym ćwiczeniem.</p>;
  return (
    <ul className="info-history">
      {history.map(({ workout, sets }) => (
        <li key={workout.id}>
          <p className="info-history__head">
            <span>{formatDay(workout.startedAt)}</span>
            <span className="muted">{workout.name}</span>
          </p>
          <p className="info-history__sets">
            {sets.map((s) => (
              <span key={s.id} className={s.warmup ? 'muted' : undefined}>
                {s.warmup ? 'R ' : ''}
                {formatKg(s.weight)} × {s.reps}
              </span>
            ))}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Notes({ exerciseId }: { exerciseId: string }) {
  const [text, setText] = useState<string | null>(null);
  const latest = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    void db.notes.get(exerciseId).then((n) => {
      latest.current = n?.text ?? '';
      setText(latest.current);
    });
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void saveNote(exerciseId, latest.current);
      }
    };
  }, [exerciseId]);

  if (text === null) return null;
  return (
    <textarea
      className="info-note"
      aria-label="Notatka do ćwiczenia"
      placeholder="Np. ławka na 3, łokcie bliżej ciała…"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        latest.current = e.target.value;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = undefined;
          void saveNote(exerciseId, latest.current);
        }, 400);
      }}
      onBlur={() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = undefined;
        void saveNote(exerciseId, latest.current);
      }}
    />
  );
}

function Stats({ history }: { history: { workout: Workout; sets: WorkoutSet[] }[] }) {
  const points = [...history]
    .reverse()
    .map(({ workout, sets }) => {
      const working = sets.filter((s) => !s.warmup && s.reps > 0);
      return {
        t: workout.startedAt,
        weight: Math.max(0, ...working.map((s) => s.weight)),
        e1rm: Math.max(0, ...working.map((s) => epley1RM(s.weight, s.reps))),
      };
    })
    .filter((p) => p.weight > 0);
  if (points.length === 0) return <p className="info-empty">Statystyki pojawią się po pierwszym treningu z ciężarem.</p>;
  const bestW = Math.max(...points.map((p) => p.weight));
  const bestE = Math.max(...points.map((p) => p.e1rm));
  return (
    <div className="info-stats">
      <div className="info-stats__tiles">
        <div><span className="muted">Najcięższa seria</span><strong>{formatKg(bestW)} kg</strong></div>
        <div><span className="muted">Szac. maks. (1RM)</span><strong>{formatKg(bestE)} kg</strong></div>
      </div>
      <MiniChart
        points={points.map((p) => ({ label: formatDay(p.t).slice(0, 5), a: p.weight, b: p.e1rm }))}
        labelA="Ciężar"
        labelB="Szac. 1RM"
      />
    </div>
  );
}

export default function ExerciseInfoSheet({ exerciseId, exerciseName, workoutId, tab, onTab, onClose }: Props) {
  const history = useLiveQuery(() => getExerciseHistory(exerciseId, workoutId), [exerciseId, workoutId]);
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-label={exerciseName} aria-modal="true" className="sheet info-sheet">
        <div className="info-sheet__bar">
          <h2>{exerciseName}</h2>
          <button type="button" className="info-sheet__close" aria-label="Zamknij" onClick={onClose}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="info-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`info-tab${tab === t.id ? ' info-tab--on' : ''}`}
              onClick={() => onTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="info-body">
          {tab === 'notatki' && <Notes exerciseId={exerciseId} />}
          {tab === 'historia' && history && <History history={history} />}
          {tab === 'statystyki' && history && <Stats history={history} />}
        </div>
      </div>
    </div>
  );
}
