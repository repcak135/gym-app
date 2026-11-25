import { Fragment, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Plus, X } from 'lucide-react';

import { db } from '../data/db';
import type { Exercise } from '../data/types';
import ExerciseFinder, { FinderEmpty } from './ExerciseFinder';
import { EMPTY_FINDER, useExerciseFinder, type FinderState } from '../hooks/useExerciseFinder';
import ExerciseRowContent from './ExerciseRow';
import ExerciseForm from './ExerciseForm';
import { useUsedIds } from '../hooks/useExerciseScope';
import { rankForSwap, swapMuscles } from '../data/swapRank';
import { muscleLabel } from '../data/exerciseLabels';
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
  /** Swap mode: id of the exercise being replaced — same-muscle alternatives are listed first. */
  replacing?: string;
}

export default function ExercisePicker({
  existingIds,
  onDone,
  onClose,
  title = 'Dodaj ćwiczenia',
  existingLabel = 'W dniu',
  single = false,
  replacing,
}: ExercisePickerProps) {
  const all = useLiveQuery(() => db.exercises.toArray(), []);
  const [finder, setFinder] = useState<FinderState>(EMPTY_FINDER);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<string[]>([]);
  // "Utwórz własne ćwiczenie": the custom exercise form on top of the picker.
  const [creating, setCreating] = useState(false);
  const existing = useMemo(() => new Set(existingIds), [existingIds]);

  const { filtered, recent, isFiltered } = useExerciseFinder(all, finder);
  const usedIds = useUsedIds();
  const replaced = useMemo(() => (replacing ? all?.find((e) => e.id === replacing) : undefined), [all, replacing]);
  const swap = useMemo(
    () => (replaced ? rankForSwap(filtered, replaced, usedIds) : null),
    [replaced, filtered, usedIds],
  );
  // Swap mode: "Podobne (barki)" first, then "Pozostałe"; otherwise the plain list.
  const ordered = swap ? [...swap.similar, ...swap.rest] : filtered;
  const similarCount = swap?.similar.length ?? 0;
  const similarTitle = replaced
    ? `Podobne (${swapMuscles(replaced).map((m) => muscleLabel(m).toLowerCase()).join(', ')})`
    : '';
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
        <ExerciseRowContent exercise={ex} size={48} query={finder.query} />
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

  // A new exercise is picked straight away: single choice closes, otherwise it joins the selection.
  const created = (id: string) => {
    setCreating(false);
    if (single) {
      void Promise.resolve(onDone([id])).then(onClose);
      return;
    }
    setSelected((s) => (s.includes(id) ? s : [...s, id]));
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
        <button type="button" className="picker__create" onClick={() => setCreating(true)}>
          <Plus size={20} aria-hidden="true" />
          <span>
            Utwórz własne ćwiczenie
            {finder.query.trim() && <small> „{finder.query.trim()}”</small>}
          </span>
        </button>
        {all === undefined && <p className="picker__empty">Ładowanie…</p>}
        {all !== undefined && filtered.length === 0 && (
          <FinderEmpty state={finder} withAddHint={false} onReset={() => changeFinder({ query: '', muscle: null, equipment: null })} />
        )}
        {!swap && !isFiltered && recent.length > 0 && (
          <section aria-label="Ostatnio używane" className="picker__section">
            <p className="exercises-section-title">Ostatnio używane</p>
            {recent.map(renderRow)}
            <p className="exercises-section-title">Wszystkie ćwiczenia</p>
          </section>
        )}
        {ordered.slice(0, limit).map((ex, i) => (
          <Fragment key={ex.id}>
            {swap && i === 0 && similarCount > 0 && <p className="exercises-section-title">{similarTitle}</p>}
            {swap && i === similarCount && similarCount > 0 && <p className="exercises-section-title">Pozostałe</p>}
            {renderRow(ex)}
          </Fragment>
        ))}
        {filtered.length > limit && (
          <button type="button" className="exercises-more-btn" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Pokaż więcej ({filtered.length - limit} pozostałych)
          </button>
        )}
      </div>

      {creating && (
        <div className="picker picker--form" role="dialog" aria-label="Nowe ćwiczenie" aria-modal="true">
          <div className="picker__bar">
            <button type="button" className="picker__close" aria-label="Wróć do listy" onClick={() => setCreating(false)}>
              <X size={24} aria-hidden="true" />
            </button>
            <h2 className="picker__title">Nowe ćwiczenie</h2>
          </div>
          <div className="picker__list picker__form">
            <ExerciseForm initialName={finder.query.trim()} onSaved={created} onCancel={() => setCreating(false)} />
          </div>
        </div>
      )}

      {!single && <div className="picker__footer">
        <button type="button" className="plan-btn plan-btn--primary plan-btn--block" onClick={() => void done()}>
          {selected.length > 0 ? `Gotowe (${selected.length})` : 'Gotowe'}
        </button>
      </div>}
    </div>
  );
}
