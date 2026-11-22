import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router';
import { Settings } from 'lucide-react';
import { db } from '../data/db';
import { formatReps, getLastPlanDayId, nextDay } from '../data/plans';
import { getActiveWorkout, startWorkout } from '../data/workouts';
import { useNow } from '../hooks/useNow';
import { unlockAudio } from '../audio/beep';
import { formatClock } from '../data/progression';
import type { Workout } from '../data/types';
import './StartPage.css';
import './SettingsPage.css';

function StartHeader() {
  return (
    <div className="start-header">
      <h1>Start</h1>
      <Link to="/ustawienia" className="start-settings" aria-label="Ustawienia">
        <Settings size={22} aria-hidden="true" />
      </Link>
    </div>
  );
}

const MAX_SHOWN = 6;

function ActiveWorkoutCard({ workout }: { workout: Workout }) {
  const now = useNow(1000);
  return (
    <section className="start-card start-card--live" aria-label="Trwa trening">
      <p className="start-label">Trwa trening · {formatClock((now - workout.startedAt) / 1000)}</p>
      <p className="start-day">{workout.name}</p>
      <Link to="/trening" className="start-btn" onClick={unlockAudio}>Wróć do treningu</Link>
    </section>
  );
}

function EmptyWorkoutButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="start-btn start-btn--ghost"
      onClick={() => { unlockAudio(); void startWorkout({}).then(() => navigate('/trening')); }}
    >
      Pusty trening
    </button>
  );
}

function exercisesLabel(n: number): string {
  if (n === 1) return '1 ćwiczenie';
  const last = n % 10;
  const last2 = n % 100;
  if (last >= 2 && last <= 4 && !(last2 >= 12 && last2 <= 14)) return `${n} ćwiczenia`;
  return `${n} ćwiczeń`;
}

export default function StartPage() {
  const navigate = useNavigate();
  const data = useLiveQuery(async () => {
    const active = await getActiveWorkout();
    if (active) return { plan: undefined, active };
    const settings = await db.settings.get('app');
    const plan = settings?.activePlanId ? await db.plans.get(settings.activePlanId) : undefined;
    if (!plan) return { plan: undefined };
    const lastDayId = await getLastPlanDayId(plan.id);
    const day = nextDay(plan, lastDayId);
    const items = day?.items ?? [];
    const exercises = await db.exercises.bulkGet(items.map((i) => i.exerciseId));
    return { plan, day, items, names: exercises.map((e) => e?.name ?? 'Nieznane ćwiczenie') };
  });

  if (!data) return <article><StartHeader /></article>;

  if ('active' in data && data.active) {
    return (
      <article>
        <StartHeader />
        <ActiveWorkoutCard workout={data.active} />
      </article>
    );
  }

  const { plan } = data;
  if (!plan) {
    return (
      <article>
        <StartHeader />
        <section className="start-card">
          <p style={{ margin: 0 }}>Brak aktywnego planu</p>
          <Link to="/plany" className="start-btn inline">Utwórz plan</Link>
        </section>
        <EmptyWorkoutButton />
      </article>
    );
  }

  const { day, items = [], names = [] } = data;

  return (
    <article>
      <StartHeader />
      <section className="start-card" aria-label="Następny trening">
        <p className="start-label">Aktywny plan</p>
        <Link to={`/plany/${plan.id}`} className="start-plan-link">{plan.name}</Link>
        {day ? (
          <>
            <p className="start-label">Następny dzień</p>
            <p className="start-day">{day.name}</p>
            <p className="start-count">{exercisesLabel(items.length)}</p>
            <button
              type="button"
              className="start-btn"
              disabled={items.length === 0}
              onClick={() => {
                unlockAudio();
                void startWorkout({ planId: plan.id, dayId: day.id }).then(() => navigate('/trening'));
              }}
            >
              Rozpocznij trening
            </button>
            {items.length === 0 && <p className="start-hint">Ten dzień nie ma jeszcze ćwiczeń.</p>}
            {items.length > 0 && (
              <ul className="start-list">
                {items.slice(0, MAX_SHOWN).map((it, i) => (
                  <li key={i}>
                    <span>{names[i]}</span>
                    <span className="muted">{it.sets} × {formatReps(it)}</span>
                  </li>
                ))}
                {items.length > MAX_SHOWN && (
                  <li><span className="muted">+ {items.length - MAX_SHOWN} więcej</span></li>
                )}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className="start-count">Plan nie ma jeszcze dni.</p>
            <Link to={`/plany/${plan.id}`} className="start-btn inline">Dodaj dzień</Link>
          </>
        )}
      </section>
      <EmptyWorkoutButton />
    </article>
  );
}
