import { useState, useCallback, useEffect, useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ScanLine, Send } from 'lucide-react';

import { db } from '../data/db';
import type { Scope } from '../hooks/useExerciseScope';
import ScanQrSheet from '../components/ScanQrSheet';
import ExerciseFinder, { FinderEmpty } from '../components/ExerciseFinder';
import { useExerciseFinder, type FinderState } from '../hooks/useExerciseFinder';
import ExerciseRowContent from '../components/ExerciseRow';
import { exercisesLabel } from './planFormat';
import { removeCustomExerciseUndoable } from '../data/undoable';
import { showUndo } from '../undo';
import SwipeRow from '../components/SwipeRow';
import { saveListMemo, takeListMemo } from './exercisesListMemo';
import './ExercisesPage.css';

const PAGE_SIZE = 60;
const PARAM: Record<keyof FinderState, string> = { query: 'q', muscle: 'm', equipment: 's', scope: 't' };

export default function ExercisesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const muscleFilter = searchParams.get('m') ?? '';   // empty string = no filter
  const equipFilter  = searchParams.get('s') ?? '';
  const scopeParam   = searchParams.get('t');
  const scope: Scope = scopeParam === 'moje' || scopeParam === 'uzywane' ? scopeParam : 'all';

  const finder: FinderState = { query, muscle: muscleFilter || null, equipment: equipFilter || null, scope };

  // Coming back from an exercise card: same search/filters, same loaded rows, same scroll position.
  const location = useLocation();
  const [memo] = useState(() => takeListMemo());
  const [limit, setLimit] = useState(memo?.limit ?? PAGE_SIZE);
  const restored = useRef(!memo);
  useEffect(() => {
    // The card's "Wróć" links to the bare list: put the remembered filters back.
    if (memo?.search && !location.search) setSearchParams(new URLSearchParams(memo.search), { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Toolbar state lives in the URL (q, m, s, t); any change shows the first page again.
  const changeFinder = useCallback(
    (patch: Partial<FinderState>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch) as [keyof FinderState, string | null][]) {
          const val = k === 'scope' && v === 'all' ? '' : (v ?? '');
          if (val) next.set(PARAM[k], val);
          else next.delete(PARAM[k]);
        }
        return next;
      });
      setLimit(PAGE_SIZE);
    },
    [setSearchParams],
  );

  const allExercises = useLiveQuery(() => db.exercises.toArray(), []);
  const { filtered, recent: recentExercises, isFiltered } = useExerciseFinder(allExercises, finder);
  const customCount = allExercises ? allExercises.filter((e) => e.custom).length : 0;
  const [scanning, setScanning] = useState(false);
  const isLoaded   = allExercises !== undefined && allExercises.length > 0;

  const visible = filtered.slice(0, limit);

  useEffect(() => {
    if (restored.current || !memo || !isLoaded || filtered.length === 0) return;
    if (memo.search !== location.search) {
      // filters not back yet (next render), or the list was opened with other filters
      if (location.search) restored.current = true;
      return;
    }
    restored.current = true;
    // After the screen's own scroll-to-top.
    requestAnimationFrame(() => window.scrollTo(0, memo.scrollY));
  }, [memo, isLoaded, filtered.length, location.search]);

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
    <article
      onClickCapture={(e) => {
        if ((e.target as Element).closest('a[href*="/cwiczenia/"]')) {
          saveListMemo({ search: location.search, limit, scrollY: window.scrollY });
        }
      }}
    >
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

      <ExerciseFinder state={finder} onChange={changeFinder}>
        {scope === 'moje' && (
          <div className="exercises-share-actions">
            <button type="button" className="plan-btn" onClick={() => setScanning(true)}>
              <ScanLine size={18} aria-hidden="true" /> Skanuj kod QR
            </button>
            {customCount > 0 && (
              <Link to="/cwiczenia/wyslij" className="plan-btn">
                <Send size={18} aria-hidden="true" /> Wyślij wszystkie moje
              </Link>
            )}
          </div>
        )}
      </ExerciseFinder>

      {/* Ostatnio używane */}
      {!isFiltered && recentExercises.length > 0 && (
        <section aria-label="Ostatnio używane">
          <p className="exercises-section-title">Ostatnio używane</p>
          <div className="exercise-list">
            {recentExercises.map((ex) => (
              <Link
                key={ex.id}
                to={`/cwiczenia/${encodeURIComponent(ex.id)}`}
                className="exercise-row"
                aria-label={ex.name}
              >
                <ExerciseRowContent exercise={ex} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Result list */}
      <section aria-label="Lista ćwiczeń">
        <p className="exercises-count">{exercisesLabel(filtered.length)}</p>
        {filtered.length === 0 && (
          <FinderEmpty
            state={finder}
            withAddHint
            onReset={() => changeFinder({ query: '', muscle: null, equipment: null })}
          />
        )}
        <div className="exercise-list">
          {visible.map((ex) => {
            const row = (
              <Link
                key={ex.id}
                to={`/cwiczenia/${encodeURIComponent(ex.id)}`}
                className="exercise-row"
                aria-label={ex.name}
              >
                <ExerciseRowContent exercise={ex} />
              </Link>
            );
            if (scope !== 'moje' || !ex.custom) return row;
            // Own exercises can be swiped away (unless a plan or the history still uses them).
            return (
              <SwipeRow
                key={ex.id}
                label={ex.name}
                onDelete={async () => {
                  const res = await removeCustomExerciseUndoable(ex.id);
                  if (!res.ok) {
                    showUndo(res.reason);
                    return false;
                  }
                  showUndo(`Usunięto ćwiczenie „${ex.name}”`, res.restore);
                }}
              >
                {row}
              </SwipeRow>
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

      {scanning && <ScanQrSheet onClose={() => setScanning(false)} />}
    </article>
  );
}
