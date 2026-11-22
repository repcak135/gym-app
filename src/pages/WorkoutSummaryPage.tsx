import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router';
import { Trophy } from 'lucide-react';
import { db } from '../data/db';
import { summarizeWorkout, type RecordKind } from '../data/workouts';
import { formatClock, formatKg } from '../data/progression';
import { formatDay } from './planFormat';
import './PlansPage.css';
import './WorkoutSummaryPage.css';

const RECORD_LABEL: Record<RecordKind, string> = {
  weight: 'najcięższa seria',
  e1rm: 'szac. maks. (1RM)',
  volume: 'objętość',
  reps: 'więcej powtórzeń',
};

function recordValue(r: { kind: RecordKind; value: number; weight?: number; reps?: number }): string {
  if (r.kind === 'reps') return `${formatKg(r.weight ?? 0)} kg × ${r.reps ?? r.value}`;
  return `${formatKg(r.value)} kg`;
}

function setsLabel(n: number): string {
  if (n === 1) return 'seria';
  const l = n % 10;
  const l2 = n % 100;
  return l >= 2 && l <= 4 && !(l2 >= 12 && l2 <= 14) ? 'serie' : 'serii';
}

export default function WorkoutSummaryPage() {
  const { id = '' } = useParams();
  const data = useLiveQuery(async () => {
    const workout = await db.workouts.get(id);
    if (!workout) return { workout: undefined };
    const summary = await summarizeWorkout(id);
    const names = await db.exercises.bulkGet(summary.records.map((r) => r.exerciseId));
    return { workout, summary, names: names.map((e) => e?.name ?? 'Nieznane ćwiczenie') };
  }, [id]);

  if (!data) return <article className="summary" />;
  if (!data.workout) {
    return (
      <article className="summary">
        <p>Nie znaleziono treningu.</p>
        <Link to="/" className="plan-btn plan-btn--primary">Gotowe</Link>
      </article>
    );
  }
  const { workout, summary, names } = data as Exclude<typeof data, { workout: undefined }>;

  return (
    <article className="summary">
      <p className="summary__kicker">Trening zakończony</p>
      <h1>{workout.name}</h1>
      <p className="muted summary__date">{formatDay(workout.startedAt)}</p>

      <div className="summary__tiles">
        <div className="summary__tile">
          <span>Czas</span>
          <strong>{formatClock(summary.durationSec)}</strong>
        </div>
        <div className="summary__tile">
          <span>Serie</span>
          <strong>{summary.sets}</strong>
          <small>{setsLabel(summary.sets)} robocze</small>
        </div>
        <div className="summary__tile summary__tile--wide">
          <span>Objętość</span>
          <strong>{formatKg(summary.volume)} kg</strong>
          <small>bez rozgrzewek</small>
        </div>
      </div>

      <section className="summary__records" aria-label="Nowe rekordy">
        <h2>Nowe rekordy</h2>
        {summary.records.length === 0 ? (
          <p className="muted">Tym razem bez nowych rekordów.</p>
        ) : (
          <ul>
            {summary.records.map((r, i) => (
              <li key={`${r.exerciseId}-${r.kind}`}>
                <Trophy size={20} aria-hidden="true" />
                <span>
                  <strong>{names[i]}</strong>
                  <span className="muted"> — {RECORD_LABEL[r.kind]} {recordValue(r)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link to="/" replace className="plan-btn plan-btn--primary plan-btn--block summary__done">Gotowe</Link>
    </article>
  );
}
