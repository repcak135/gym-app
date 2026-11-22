import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, X } from 'lucide-react';

import { db } from '../data/db';
import { filterExercises } from '../data/exercises';
import { muscleLabel, equipmentLabel } from '../data/exerciseLabels';
import ExerciseThumb from './ExerciseThumb';
import '../pages/ExercisesPage.css';
import './ExercisePicker.css';

const PAGE_SIZE = 60;

interface ExercisePickerProps {
  /** Exercises already in the day: shown as added, not selectable. */
  existingIds: string[];
  /** Called with the selected ids in tap order (may be empty). */
  onDone: (exerciseIds: string[]) => void | Promise<void>;
  onClose: () => void;
  /** Dialog title (default "Dodaj ćwiczenia"). */
  title?: string;
  /** Label shown on exercises that are already there (default "W dniu"). */
  existingLabel?: string;
  /** Single choice: a tap picks the exercise and closes the picker. */
  single?: boolean;
}

export default function ExercisePicker({
  existingIds,
  onDone,
  onClose,
  title = 'Dodaj ćwiczenia',
  existingLabel = 'W dniu',
  single = false,
}: ExercisePickerProps) {
  const all = useLiveQuery(() => db.exercises.toArray(), []);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<string[]>([]);
  const existing = useMemo(() => new Set(existingIds), [existingIds]);

  const filtered = useMemo(
    () => (all ? filterExercises(all, { query: query || undefined }) : []),
    [all, query],
  );

  const toggle = (id: string) => {
    if (single) {
      void Promise.resolve(onDone([id])).then(onClose);
      return;
    }
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const done = async () => {
    if (selected.length > 0) await onDone(selected);
    onClose();
  };

  return (
    <div
      className="picker"
      role="dialog"
      aria-label={title}
      aria-modal="true"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="picker__bar">
        <button type="button" className="picker__close" aria-label="Zamknij" onClick={onClose}>
          <X size={24} aria-hidden="true" />
        </button>
        <h2 className="picker__title">{title}</h2>
      </div>

      <div className="picker__search">
        <input
          type="search"
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
          const inDay = existing.has(ex.id);
          const isSelected = selected.includes(ex.id);
          return (
            <button
              key={ex.id}
              type="button"
              className={`exercise-row picker__row${isSelected ? ' picker__row--selected' : ''}`}
              aria-label={ex.name}
              aria-pressed={inDay || single ? undefined : isSelected}
              disabled={inDay}
              onClick={() => toggle(ex.id)}
            >
              <ExerciseThumb exercise={ex} size={48} />
              <span className="exercise-row__info">
                <span className="exercise-row__name">
                  {ex.name}
                  {ex.custom && <span className="badge-custom">Własne</span>}
                </span>
                <span className="exercise-row__meta">{meta}</span>
              </span>
              {inDay ? (
                <span className="picker__in-day">{existingLabel}</span>
              ) : (
                <span className={`picker__check${isSelected ? ' picker__check--on' : ''}`} aria-hidden="true">
                  {isSelected && <Check size={18} strokeWidth={3} />}
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

      {!single && <div className="picker__footer">
        <button type="button" className="plan-btn plan-btn--primary plan-btn--block" onClick={() => void done()}>
          {selected.length > 0 ? `Gotowe (${selected.length})` : 'Gotowe'}
        </button>
      </div>}
    </div>
  );
}
