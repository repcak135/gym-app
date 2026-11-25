import { useState, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';

import { MUSCLE_FILTER_OPTIONS, EQUIPMENT, muscleLabel, equipmentLabel } from '../data/exerciseLabels';
import { DELT_LABEL, type DeltHead } from '../data/deltHeads';
import { SCOPE_OPTIONS, emptyScopeText, type Scope } from '../hooks/useExerciseScope';
import type { FinderState } from '../hooks/useExerciseFinder';
import FilterSheet from './FilterSheet';
import Segmented from './stats/Segmented';
import '../pages/ExercisesPage.css';

/**
 * One search + filters + scope toolbar for every place that lists exercises
 * (Ćwiczenia tab and the exercise picker), so they cannot drift apart again.
 */
export default function ExerciseFinder({
  state,
  onChange,
  children,
}: {
  state: FinderState;
  onChange: (patch: Partial<FinderState>) => void;
  /** Shown between the scope switch and the search (e.g. share buttons for "Moje"). */
  children?: ReactNode;
}) {
  const [openSheet, setOpenSheet] = useState<'muscle' | 'equip' | null>(null);
  return (
    <>
      <div className="exercises-scope">
        <Segmented<Scope>
          label="Które ćwiczenia"
          options={SCOPE_OPTIONS}
          value={state.scope}
          onChange={(scope) => onChange({ scope })}
        />
      </div>

      {children}

      <div className="exercises-toolbar">
        <div className="exercises-search-wrap">
          <input
            type="search"
            placeholder="Szukaj ćwiczenia"
            aria-label="Szukaj ćwiczenia"
            value={state.query}
            onChange={(e) => onChange({ query: e.target.value })}
          />
          {state.query && (
            <button
              type="button"
              aria-label="Wyczyść wyszukiwanie"
              className="exercises-search-clear"
              onClick={() => onChange({ query: '' })}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="exercises-filters">
          <FilterButton
            label="Mięśnie"
            valueLabel={state.muscle ? muscleLabel(state.muscle) : null}
            onOpen={() => setOpenSheet('muscle')}
            onClear={() => onChange({ muscle: null })}
          />
          <FilterButton
            label="Sprzęt"
            valueLabel={state.equipment ? equipmentLabel(state.equipment) : null}
            onOpen={() => setOpenSheet('equip')}
            onClear={() => onChange({ equipment: null })}
          />
        </div>
      </div>

      {openSheet === 'muscle' && (
        <FilterSheet
          title="Mięśnie"
          options={MUSCLE_FILTER_OPTIONS as string[]}
          labels={(m) => (m.startsWith('shoulders:') ? DELT_LABEL[m.slice(10) as DeltHead] : muscleLabel(m))}
          value={state.muscle}
          onSelect={(muscle) => onChange({ muscle })}
          onClose={() => setOpenSheet(null)}
        />
      )}
      {openSheet === 'equip' && (
        <FilterSheet
          title="Sprzęt"
          options={EQUIPMENT as unknown as string[]}
          labels={equipmentLabel}
          value={state.equipment}
          onSelect={(equipment) => onChange({ equipment })}
          onClose={() => setOpenSheet(null)}
        />
      )}
    </>
  );
}

/** Empty list: the scope's own hint, or "nothing matches" with a reset button. */
export function FinderEmpty({
  state,
  withAddHint,
  onReset,
}: {
  state: FinderState;
  withAddHint: boolean;
  onReset: () => void;
}) {
  const searching = !!(state.query || state.muscle || state.equipment);
  const scopeText = !searching ? emptyScopeText(state.scope, withAddHint) : null;
  if (scopeText) return <p className="exercises-empty">{scopeText}</p>;
  return (
    <div className="exercises-empty">
      <p>Brak ćwiczeń dla tego wyszukiwania.</p>
      <button type="button" className="plan-btn" onClick={onReset}>
        Wyczyść wyszukiwanie i filtry
      </button>
    </div>
  );
}

function FilterButton({ label, valueLabel, onOpen, onClear }: {
  label: string;
  valueLabel: string | null;
  onOpen: () => void;
  onClear: () => void;
}) {
  return (
    <div className={`filter-group${valueLabel ? ' filter-group--active' : ''}`}>
      <button type="button" className="filter-btn" onClick={onOpen} aria-haspopup="dialog">
        {valueLabel ?? label}
        {!valueLabel && <ChevronDown size={14} aria-hidden="true" />}
      </button>
      {valueLabel && (
        <button type="button" className="filter-clear" onClick={onClear} aria-label={`Wyczyść filtr: ${label}`}>
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
