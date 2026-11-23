import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';

import {
  decodePlan,
  extractPayload,
  importSharedPlan,
  resolveExercises,
  type ExerciseStatus,
  type SharedPlan,
} from '../data/planShare';
import { formatReps, formatRest } from '../data/plans';
import './PlansPage.css';
import './PlanSharePage.css';

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

function itemText(it: { sets: number; warmupSets: number; repsMin: number; repsMax: number; restSec: number }): string {
  const warm = it.warmupSets > 0 ? ` + ${it.warmupSets} rozgrz.` : '';
  return `${it.sets} × ${formatReps(it)}${warm} · przerwa ${formatRest(it.restSec)}`;
}

export default function PlanImportPage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  // Read the raw value: URLSearchParams would turn the '+' of the lz-string alphabet into spaces.
  const data = extractPayload(search) ?? '';

  const decoded = useMemo((): { plan: SharedPlan } | { error: string } => {
    try {
      return { plan: decodePlan(data) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [data]);

  const [statuses, setStatuses] = useState<Map<string, { status: ExerciseStatus }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!('plan' in decoded)) return;
    let alive = true;
    void resolveExercises(decoded.plan).then((m) => alive && setStatuses(m));
    return () => {
      alive = false;
    };
  }, [decoded]);

  if ('error' in decoded) {
    return (
      <article>
        <h1>Plan od znajomego</h1>
        <p className="pimport__error" role="alert">
          Link jest uszkodzony albo niepełny. Poproś o wysłanie planu jeszcze raz.
        </p>
        <Link to="/plany" className="plan-btn">Przejdź do planów</Link>
      </article>
    );
  }

  const plan = decoded.plan;
  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await importSharedPlan(plan);
      navigate(`/plany/${created.id}`, { replace: true });
    } catch (e) {
      setError(`Nie udało się dodać planu: ${(e as Error).message}`);
      setBusy(false);
    }
  };

  const newCount = statuses ? [...statuses.values()].filter((s) => s.status !== 'known').length : 0;

  return (
    <article>
      <Link to="/plany" className="plan-back" aria-label="Wróć do planów">
        <ArrowLeft size={18} aria-hidden="true" />
        Plany
      </Link>
      <p className="plan-muted">Plan od znajomego</p>
      <h1>{plan.name}</h1>
      <p className="plan-muted">
        {plan.days.length === 0 ? 'Plan bez dni.' : `Dni: ${plan.days.length}`}
        {newCount > 0 && ` · nowe ćwiczenia: ${newCount} (zostaną dodane jako Twoje własne)`}
      </p>

      {!isStandalone() && (
        <p className="pimport__note">
          Masz aplikację na ekranie głównym? Na iPhonie ma ona osobne dane — skopiuj ten link
          i w aplikacji wybierz Plany → Dodaj plan z linku.
        </p>
      )}

      {plan.days.map((day, di) => (
        <section key={di} className="pimport__day" aria-label={day.name}>
          <h2>{day.name}</h2>
          {day.items.length === 0 ? (
            <p className="plan-muted">Brak ćwiczeń</p>
          ) : (
            <ul className="pimport__list">
              {day.items.map((it, ii) => {
                const st = statuses?.get(it.exercise.id)?.status;
                return (
                  <li key={ii} className="pimport__item">
                    <span className="pimport__name">{it.exercise.name}</span>
                    {st === 'new-custom' && <span className="pimport__badge">nowe ćwiczenie</span>}
                    {st === 'unknown' && <span className="pimport__badge">nieznane — doda się jako własne</span>}
                    <span className="pimport__meta">
                      {itemText(it)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}

      {error && <p className="pimport__error" role="alert">{error}</p>}
      <button
        type="button"
        className="plan-btn plan-btn--primary plan-btn--block pimport__add"
        disabled={busy}
        onClick={() => void add()}
      >
        {busy ? 'Dodaję…' : 'Dodaj plan'}
      </button>
    </article>
  );
}
