import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ArrowLeft } from 'lucide-react';

import {
  decodeExercises,
  existingCustomNames,
  importSharedExercises,
  type SharedCustomExercise,
} from '../data/exerciseShare';
import { extractPayload } from '../data/planShare';
import { equipmentLabel, muscleLabel } from '../data/exerciseLabels';
import './PlansPage.css';
import './PlanSharePage.css';

export default function ExercisesImportPage() {
  const { search } = useLocation();
  // Raw value: URLSearchParams would turn the '+' of the lz-string alphabet into spaces.
  const data = extractPayload(search) ?? '';

  const decoded = useMemo((): { items: SharedCustomExercise[] } | { error: string } => {
    try {
      return { items: decodeExercises(data) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [data]);

  const [have, setHave] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);

  useEffect(() => {
    if (!('items' in decoded)) return;
    let alive = true;
    void existingCustomNames(decoded.items).then((s) => alive && setHave(s));
    return () => {
      alive = false;
    };
  }, [decoded, result]);

  if ('error' in decoded) {
    return (
      <article>
        <h1>Ćwiczenia od znajomego</h1>
        <p className="pimport__error" role="alert">
          Link jest uszkodzony albo niepełny. Poproś o wysłanie ćwiczeń jeszcze raz.
        </p>
        <Link to="/cwiczenia" className="plan-btn">Przejdź do ćwiczeń</Link>
      </article>
    );
  }

  const items = decoded.items;
  const isKnown = (it: SharedCustomExercise) => have?.has(it.name.trim().toLowerCase()) ?? false;
  const newCount = have ? items.filter((it) => !isKnown(it)).length : items.length;

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await importSharedExercises(items));
    } catch (e) {
      setError(`Nie udało się dodać ćwiczeń: ${(e as Error).message}`);
    }
    setBusy(false);
  };

  return (
    <article>
      <Link to="/cwiczenia?t=moje" className="plan-back" aria-label="Wróć do ćwiczeń">
        <ArrowLeft size={18} aria-hidden="true" />
        Ćwiczenia
      </Link>
      <p className="plan-muted">Ćwiczenia od znajomego</p>
      <h1>{items.length === 1 ? items[0].name : `Ćwiczenia (${items.length})`}</h1>

      <ul className="pimport__list">
        {items.map((it, i) => {
          const meta = [it.primaryMuscles.map(muscleLabel).join(', '), equipmentLabel(it.equipment)]
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={i} className="pimport__item">
              <span className="pimport__name">{it.name}</span>
              {isKnown(it) && <span className="pimport__badge">Masz już</span>}
              {meta && <span className="pimport__meta">{meta}</span>}
            </li>
          );
        })}
      </ul>

      {result && (
        <p className="pshare__status" role="status">
          {result.added > 0 ? `Dodano: ${result.added}.` : 'Nic nie dodano.'}
          {result.skipped > 0 && ` Pominięto (masz już): ${result.skipped}.`}
        </p>
      )}
      {error && <p className="pimport__error" role="alert">{error}</p>}
      {result ? (
        <Link to="/cwiczenia?t=moje" className="plan-btn plan-btn--primary plan-btn--block pimport__add">
          Przejdź do moich ćwiczeń
        </Link>
      ) : (
        <button
          type="button"
          className="plan-btn plan-btn--primary plan-btn--block pimport__add"
          disabled={busy || newCount === 0}
          onClick={() => void add()}
        >
          {busy ? 'Dodaję…' : newCount === 0 ? 'Wszystko już masz' : 'Dodaj ćwiczenia'}
        </button>
      )}
    </article>
  );
}
