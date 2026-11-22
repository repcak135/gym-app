import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { db } from '../data/db';
import { formatReps, getLastPlanDayId, nextDay } from '../data/plans';
import './StartPage.css';

const MAX_SHOWN = 6;

function exercisesLabel(n: number): string {
  if (n === 1) return '1 ćwiczenie';
  const last = n % 10;
  const last2 = n % 100;
  if (last >= 2 && last <= 4 && !(last2 >= 12 && last2 <= 14)) return `${n} ćwiczenia`;
  return `${n} ćwiczeń`;
}

export default function StartPage() {
  const data = useLiveQuery(async () => {
    const settings = await db.settings.get('app');
    const plan = settings?.activePlanId ? await db.plans.get(settings.activePlanId) : undefined;
    if (!plan) return { plan: undefined };
    const lastDayId = await getLastPlanDayId(plan.id);
    const day = nextDay(plan, lastDayId);
    const items = day?.items ?? [];
    const exercises = await db.exercises.bulkGet(items.map((i) => i.exerciseId));
    return { plan, day, items, names: exercises.map((e) => e?.name ?? 'Nieznane ćwiczenie') };
  });

  if (!data) return <article><h1>Start</h1></article>;

  const { plan } = data;
  if (!plan) {
    return (
      <article>
        <h1>Start</h1>
        <section className="start-card">
          <p style={{ margin: 0 }}>Brak aktywnego planu</p>
          <Link to="/plany" className="start-btn inline">Utwórz plan</Link>
        </section>
      </article>
    );
  }

  const { day, items = [], names = [] } = data;

  return (
    <article>
      <h1>Start</h1>
      <section className="start-card" aria-label="Następny trening">
        <p className="start-label">Aktywny plan</p>
        <Link to={`/plany/${plan.id}`} className="start-plan-link">{plan.name}</Link>
        {day ? (
          <>
            <p className="start-label">Następny dzień</p>
            <p className="start-day">{day.name}</p>
            <p className="start-count">{exercisesLabel(items.length)}</p>
            <button type="button" className="start-btn" disabled>Rozpocznij trening</button>
            <p className="start-hint">Trening na żywo pojawi się w następnej wersji.</p>
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
    </article>
  );
}
