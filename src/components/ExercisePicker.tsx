import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, X } from 'lucide-react';

import { db } from '../data/db';
import type { Exercise } from '../data/types';
import ExerciseFinder, { FinderEmpty } from './ExerciseFinder';
import { EMPTY_FINDER, useExerciseFinder, type FinderState } from '../hooks/useExerciseFinder';
import ExerciseRowContent from './ExerciseRow';
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
  const [finder, setFinder] = useState<FinderState>(EMPTY_FINDER);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<string[]>([]);
  const existing = useMemo(() => new Set(existingIds), [existingIds]);

  const { filtered, recent, isFiltered } = useExerciseFinder(all, finder);
  const changeFinder = (patch: Partial<FinderState>) => {
    setFinder((f) => ({ ...f, ...patch }));
    setLimit(PAGE_SIZE);
  };

  const toggle = (id: string) => {
    if (single) {
      void Promise.resolve(onDone([id])).then(onClose);
      return;
    }
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const renderRow = (ex: Exercise) => {
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
        <ExerciseRowContent exercise={ex} size={48} />
        {inDay ? (
          <span className="picker__in-day">{existingLabel}</span>
        ) : (
          <span className={`picker__check${isSelected ? ' picker__check--on' : ''}`} aria-hidden="true">
            {isSelected && <Check size={18} strokeWidth={3} />}
          </span>
        )}
      </button>
    );
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

      <div className="picker__list">
        <div className="picker__finder">
          <ExerciseFinder state={finder} onChange={changeFinder} />
        </div>
        {all === undefined && <p className="picker__empty">Ładowanie…</p>}
        {all !== undefined && filtered.length === 0 && (
          <FinderEmpty state={finder} withAddHint={false} onReset={() => changeFinder({ query: '', muscle: null, equipment: null })} />
        )}
        {!isFiltered && recent.length > 0 && (
          <section aria-label="Ostatnio używane" className="picker__section">
            <p className="exercises-section-title">Ostatnio używane</p>
            {recent.map(renderRow)}
            <p className="exercises-section-title">Wszystkie ćwiczenia</p>
          </section>
        )}
        {filtered.slice(0, limit).map(renderRow)}
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
