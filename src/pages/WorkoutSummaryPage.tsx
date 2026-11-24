import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router';
import { Trophy } from 'lucide-react';
import { db } from '../data/db';
import { summarizeWorkout, type RecordKind } from '../data/workouts';
import { applyPlanChanges, diffWorkoutVsPlan, saveWorkoutAsDay, type PlanChange } from '../data/planSync';
import type { Workout } from '../data/types';
import '../components/Sheet.css';
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

function describeChange(c: PlanChange, name: (id: string) => string): string {
  switch (c.kind) {
    case 'swap': return `Zamiana: ${name(c.fromExerciseId)} → ${name(c.toExerciseId)}`;
    case 'add': return `Nowe ćwiczenie: ${name(c.exerciseId)} (${c.item.sets} ${setsLabel(c.item.sets)})`;
    case 'remove': return `Usunięte: ${name(c.exerciseId)}`;
    case 'sets': return `Serie: ${name(c.exerciseId)} ${c.from} → ${c.to}`;
    case 'warmups': return `Rozgrzewka: ${name(c.exerciseId)} ${c.from} → ${c.to}`;
  }
}

function PlanChangesSection({ workout }: { workout: Workout }) {
  const [state, setState] = useState<{ changes: PlanChange[]; names: Map<string, string> } | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<'open' | 'saved' | 'hidden'>('open');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const changes = await diffWorkoutVsPlan(workout.id);
      const ids = [...new Set(changes.flatMap((c) => (c.kind === 'swap' ? [c.fromExerciseId, c.toExerciseId] : [c.exerciseId])))];
      const found = await db.exercises.bulkGet(ids);
      const names = new Map(ids.map((x, i) => [x, found[i]?.name ?? 'Nieznane ćwiczenie']));
      if (cancelled) return;
      setState({ changes, names });
      setChecked(new Set(changes.map((_, i) => i)));
    })();
    return () => { cancelled = true; };
  }, [workout.id]);

  if (status === 'saved') return <p className="summary__saved" role="status">Plan zaktualizowany ✓</p>;
  if (status === 'hidden' || !state || state.changes.length === 0) return null;
  const { changes, names } = state;
  const name = (x: string) => names.get(x) ?? 'Nieznane ćwiczenie';

  const save = async () => {
    try {
      setError(null);
      await applyPlanChanges(workout.planId!, workout.dayId!, changes.filter((_, i) => checked.has(i)));
      setStatus('saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać');
    }
  };

  return (
    <section className="summary__sync" aria-label="Zmiany względem planu">
      <h2>Zmiany względem planu</h2>
      <ul>
        {changes.map((c, i) => (
          <li key={i}>
            <label>
              <input
                type="checkbox"
                checked={checked.has(i)}
                onChange={() => {
                  const next = new Set(checked);
                  if (next.has(i)) next.delete(i); else next.add(i);
                  setChecked(next);
                }}
              />
              <span>{describeChange(c, name)}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="name-sheet__error" role="alert">{error}</p>}
      <button
        type="button"
        className="plan-btn plan-btn--primary plan-btn--block"
        disabled={checked.size === 0}
        onClick={() => void save()}
      >
        Zapisz w planie
      </button>
      <button type="button" className="summary__skip" onClick={() => setStatus('hidden')}>
        Nie zmieniaj planu
      </button>
    </section>
  );
}

function SaveAsDaySection({ workout }: { workout: Workout }) {
  const plans = useLiveQuery(() => db.plans.toArray(), []);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<{ planId: string; planName: string } | null>(null);
  const [dayName, setDayName] = useState(workout.name);
  const [choice, setChoice] = useState<string>('');
  const [newName, setNewName] = useState('Mój plan');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (saved) {
    return (
      <p className="summary__saved" role="status">
        Zapisano w planie „{saved.planName}” ✓{' '}
        <Link to={`/plany/${saved.planId}`}>Zobacz plan</Link>
      </p>
    );
  }
  if (!plans) return null;
  const selected = choice === '' ? (plans[0]?.id ?? 'new') : choice;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const target = selected === 'new' ? { newPlanName: newName } : { planId: selected };
      const res = await saveWorkoutAsDay(workout.id, target, dayName);
      const plan = await db.plans.get(res.planId);
      setSaved({ planId: res.planId, planName: plan?.name ?? '' });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać');
      setBusy(false);
    }
  };

  return (
    <>
      <section className="summary__sync" aria-label="Zapisz jako dzień planu">
        <h2>Zapisz jako dzień planu</h2>
        <p className="muted">Następnym razem rozpoczniesz ten trening jednym przyciskiem.</p>
        <button type="button" className="plan-btn plan-btn--block" onClick={() => setOpen(true)}>
          Zapisz jako dzień planu
        </button>
      </section>
      {open && (
        <div
          className="sheet-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        >
          <div role="dialog" aria-label="Zapisz jako dzień planu" aria-modal="true" className="sheet">
            <div className="sheet__handle" aria-hidden="true" />
            <form
              className="confirm-sheet__body"
              onSubmit={(e) => { e.preventDefault(); void save(); }}
            >
              <p className="confirm-sheet__title">Zapisz jako dzień planu</p>
              <label className="name-sheet__label">
                Nazwa dnia
                <input
                  type="text"
                  className="name-sheet__input"
                  value={dayName}
                  onChange={(e) => setDayName(e.target.value)}
                />
              </label>
              <fieldset className="summary__plans">
                <legend>Plan</legend>
                {plans.map((p) => (
                  <label key={p.id} className="summary__radio">
                    <input type="radio" name="target-plan" checked={selected === p.id} onChange={() => setChoice(p.id)} />
                    <span>{p.name}</span>
                  </label>
                ))}
                <label className="summary__radio">
                  <input type="radio" name="target-plan" checked={selected === 'new'} onChange={() => setChoice('new')} />
                  <span>Nowy plan</span>
                </label>
              </fieldset>
              {selected === 'new' && (
                <label className="name-sheet__label">
                  Nazwa nowego planu
                  <input
                    type="text"
                    className="name-sheet__input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </label>
              )}
              {error && <p className="name-sheet__error" role="alert">{error}</p>}
              <div className="confirm-sheet__actions">
                <button type="submit" className="confirm-sheet__btn confirm-sheet__btn--primary" disabled={busy}>
                  Zapisz
                </button>
                <button type="button" className="confirm-sheet__btn confirm-sheet__btn--cancel" onClick={() => setOpen(false)}>
                  Anuluj
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default function WorkoutSummaryPage() {
  const { id = '' } = useParams();
  const data = useLiveQuery(async () => {
    const workout = await db.workouts.get(id);
    if (!workout) return { workout: undefined };
    const summary = await summarizeWorkout(id);
    const names = await db.exercises.bulkGet(summary.records.map((r) => r.exerciseId));
    const hasDone = (await db.sets.where('workoutId').equals(id).toArray()).some((s) => s.completedAt !== undefined);
    return { workout, summary, hasDone, names: names.map((e) => e?.name ?? 'Nieznane ćwiczenie') };
  }, [id]);
  // Remembered from the first load: saving as a plan day links the workout, which must not swap the sections.
  const startedWithoutPlan = useRef<boolean | null>(null);
  if (startedWithoutPlan.current === null && data?.workout) {
    startedWithoutPlan.current = !data.workout.planId || !data.workout.dayId;
  }

  if (!data) return <article className="summary" />;
  if (!data.workout) {
    return (
      <article className="summary">
        <p>Nie znaleziono treningu.</p>
        <Link to="/" className="plan-btn plan-btn--primary">Gotowe</Link>
      </article>
    );
  }
  const { workout, summary, names, hasDone } = data as Exclude<typeof data, { workout: undefined }>;
  const finished = workout.endedAt !== undefined;

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

      {finished && !startedWithoutPlan.current && <PlanChangesSection workout={workout} />}
      {finished && startedWithoutPlan.current && hasDone && <SaveAsDaySection workout={workout} />}

      <Link to="/" replace className="plan-btn plan-btn--primary plan-btn--block summary__done">Gotowe</Link>
    </article>
  );
}
