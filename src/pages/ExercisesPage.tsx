import { useState, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X, ChevronDown } from 'lucide-react';

import { db } from '../data/db';
import { filterExercises, getRecentExerciseIds } from '../data/exercises';
import {
  MUSCLES,
  EQUIPMENT,
  muscleLabel,
  equipmentLabel,
} from '../data/exerciseLabels';
import ExerciseThumb from '../components/ExerciseThumb';
import FilterSheet from '../components/FilterSheet';
import { exercisesLabel } from './planFormat';
import './ExercisesPage.css';

const PAGE_SIZE = 60;

export default function ExercisesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const muscleFilter = searchParams.get('m') ?? '';   // empty string = no filter
  const equipFilter  = searchParams.get('s') ?? '';

  // Convert empty string to null for the data layer
  const muscleVal  = muscleFilter  || null;
  const equipVal   = equipFilter   || null;

  const [openSheet, setOpenSheet] = useState<'muscle' | 'equip' | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Reset page limit when filter/search changes
  const setParam = useCallback(
    (key: string, val: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (val) next.set(key, val);
        else next.delete(key);
        return next;
      });
      setLimit(PAGE_SIZE);
    },
    [setSearchParams],
  );

  // All exercises live
  const allExercises = useLiveQuery(() => db.exercises.toArray(), []);

  // Recent exercises (only shown when no search/filter)
  const recentIds = useLiveQuery(
    () => getRecentExerciseIds(8),
    [],
  );

  const isFiltered = !!(query || muscleVal || equipVal);
  const isLoaded   = allExercises !== undefined && allExercises.length > 0;

  const filtered = useMemo(() => {
    if (!allExercises) return [];
    return filterExercises(allExercises, {
      query:     query     || undefined,
      muscle:    muscleVal ?? undefined,
      equipment: equipVal  ?? undefined,
    });
  }, [allExercises, query, muscleVal, equipVal]);

  const recentExercises = useMemo(() => {
    if (!allExercises || !recentIds || isFiltered) return [];
    return recentIds
      .map((id) => allExercises.find((e) => e.id === id))
      .filter(Boolean) as typeof allExercises;
  }, [allExercises, recentIds, isFiltered]);

  const visible = filtered.slice(0, limit);

  if (!isLoaded) {
    return (
      <article>
        <div className="exercises-header">
          <h1>Ćwiczenia</h1>
        </div>
        <p className="exercises-loading">Ładowanie bazy ćwiczeń…</p>
      </article>
    );
  }

  return (
    <article>
      <div className="exercises-header">
        <h1>Ćwiczenia</h1>
        <Link
          to="/cwiczenia/nowe"
          aria-label="Nowe ćwiczenie"
          className="exercises-add-btn"
        >
          <Plus size={22} aria-hidden="true" />
        </Link>
      </div>

      {/* Sticky toolbar */}
      <div className="exercises-toolbar">
        {/* Search */}
        <div className="exercises-search-wrap">
          <input
            type="search"
            placeholder="Szukaj ćwiczenia"
            aria-label="Szukaj ćwiczenia"
            value={query}
            onChange={(e) => setParam('q', e.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Wyczyść wyszukiwanie"
              className="exercises-search-clear"
              onClick={() => setParam('q', '')}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Filter buttons */}
        <div className="exercises-filters">
          <FilterButton
            label="Mięśnie"
            valueLabel={muscleVal ? muscleLabel(muscleVal) : null}
            onOpen={() => setOpenSheet('muscle')}
            onClear={() => setParam('m', '')}
          />
          <FilterButton
            label="Sprzęt"
            valueLabel={equipVal ? equipmentLabel(equipVal) : null}
            onOpen={() => setOpenSheet('equip')}
            onClear={() => setParam('s', '')}
          />
        </div>
      </div>

      {/* Ostatnio używane */}
      {!isFiltered && recentExercises.length > 0 && (
        <section aria-label="Ostatnio używane">
          <p className="exercises-section-title">Ostatnio używane</p>
          <div className="exercise-list">
            {recentExercises.map((ex) => {
              const metaParts = [
                ex.primaryMuscles.map(muscleLabel).join(', '),
                equipmentLabel(ex.equipment),
              ].filter(Boolean);
              return (
                <Link
                  key={ex.id}
                  to={`/cwiczenia/${encodeURIComponent(ex.id)}`}
                  className="exercise-row"
                  aria-label={ex.name}
                >
                  <ExerciseThumb exercise={ex} size={56} />
                  <span className="exercise-row__info">
                    <span className="exercise-row__name">
                      {ex.name}
                      {ex.custom && <span className="badge-custom">Własne</span>}
                    </span>
                    <span className="exercise-row__meta">{metaParts.join(' · ')}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Result list */}
      <section aria-label="Lista ćwiczeń">
        <p className="exercises-count">{exercisesLabel(filtered.length)}</p>
        <div className="exercise-list">
          {visible.map((ex) => {
            const metaParts = [
              ex.primaryMuscles.map(muscleLabel).join(', '),
              equipmentLabel(ex.equipment),
            ].filter(Boolean);
            return (
              <Link
                key={ex.id}
                to={`/cwiczenia/${encodeURIComponent(ex.id)}`}
                className="exercise-row"
                aria-label={ex.name}
              >
                <ExerciseThumb exercise={ex} size={56} />
                <span className="exercise-row__info">
                  <span className="exercise-row__name">
                    {ex.name}
                    {ex.custom && <span className="badge-custom">Własne</span>}
                  </span>
                  <span className="exercise-row__meta">{metaParts.join(' · ')}</span>
                </span>
              </Link>
            );
          })}
        </div>

        {filtered.length > limit && (
          <button
            type="button"
            className="exercises-more-btn"
            onClick={() => setLimit((l) => l + PAGE_SIZE)}
          >
            Pokaż więcej ({filtered.length - limit} pozostałych)
          </button>
        )}
      </section>

      {/* Filter sheets */}
      {openSheet === 'muscle' && (
        <FilterSheet
          title="Mięśnie"
          options={MUSCLES as unknown as string[]}
          labels={muscleLabel}
          value={muscleVal}
          onSelect={(v) => setParam('m', v ?? '')}
          onClose={() => setOpenSheet(null)}
        />
      )}
      {openSheet === 'equip' && (
        <FilterSheet
          title="Sprzęt"
          options={EQUIPMENT as unknown as string[]}
          labels={equipmentLabel}
          value={equipVal}
          onSelect={(v) => setParam('s', v ?? '')}
          onClose={() => setOpenSheet(null)}
        />
      )}
    </article>
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
