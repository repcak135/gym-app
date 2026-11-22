import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check } from 'lucide-react';

import { db } from '../data/db';
import { filterExercises } from '../data/exercises';
import { muscleLabel, equipmentLabel } from '../data/exerciseLabels';
import ExerciseThumb from './ExerciseThumb';
import '../pages/ExercisesPage.css';
import './ExercisePicker.css';

const PAGE_SIZE = 60;

interface ExercisePickerProps {
  onAdd: (exerciseId: string) => void | Promise<void>;
  onClose: () => void;
}

export default function ExercisePicker({ onAdd, onClose }: ExercisePickerProps) {
  const all = useLiveQuery(() => db.exercises.toArray(), []);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const filtered = useMemo(
    () => (all ? filterExercises(all, { query: query || undefined }) : []),
    [all, query],
  );

  const add = (id: string, name: string) => {
    void onAdd(id);
    setCounts((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
    setToast(`Dodano: ${name}`);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1500);
    setQuery('');
    setLimit(PAGE_SIZE);
    inputRef.current?.focus();
  };

  return (
    <div
      className="picker"
      role="dialog"
      aria-label="Dodaj ćwiczenia"
      aria-modal="true"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="picker__bar">
        <h2 className="picker__title">Dodaj ćwiczenia</h2>
        <button type="button" className="plan-btn plan-btn--primary picker__done" onClick={onClose}>
          Gotowe
        </button>
      </div>

      <div className="picker__search">
        <input
          ref={inputRef}
          type="search"
          autoFocus
          placeholder="Szukaj ćwiczenia"
          aria-label="Szukaj ćwiczenia"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLimit(PAGE_SIZE); }}
        />
      </div>

      <div className="picker__list">
        {all === undefined && <p className="picker__empty">Ładowanie…</p>}
        {all !== undefined && filtered.length === 0 && <p className="picker__empty">Brak wyników.</p>}
        {filtered.slice(0, limit).map((ex) => {
          const meta = [ex.primaryMuscles.map(muscleLabel).join(', '), equipmentLabel(ex.equipment)]
            .filter(Boolean)
            .join(' · ');
          const n = counts[ex.id] ?? 0;
          return (
            <button
              key={ex.id}
              type="button"
              className="exercise-row picker__row"
              aria-label={ex.name}
              onClick={() => add(ex.id, ex.name)}
            >
              <ExerciseThumb exercise={ex} size={48} />
              <span className="exercise-row__info">
                <span className="exercise-row__name">
                  {ex.name}
                  {ex.custom && <span className="badge-custom">Własne</span>}
                </span>
                <span className="exercise-row__meta">{meta}</span>
              </span>
              {n > 0 && (
                <span className="picker__added" aria-hidden="true">
                  {n === 1 ? <Check size={16} /> : `${n}×`}
                </span>
              )}
            </button>
          );
        })}
        {filtered.length > limit && (
          <button type="button" className="exercises-more-btn" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Pokaż więcej ({filtered.length - limit} pozostałych)
          </button>
        )}
      </div>

      {toast && <div className="picker__toast" role="status">{toast}</div>}
    </div>
  );
}
