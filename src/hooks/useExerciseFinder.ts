import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { filterExercises, getRecentExerciseIds } from '../data/exercises';
import type { Exercise } from '../data/types';
import { useScopedExercises, type Scope } from './useExerciseScope';

/** State of the shared exercise toolbar (`ExerciseFinder`). */
export interface FinderState {
  query: string;
  muscle: string | null;
  equipment: string | null;
  scope: Scope;
}

export const EMPTY_FINDER: FinderState = { query: '', muscle: null, equipment: null, scope: 'all' };

export function isFinderFiltered(s: FinderState): boolean {
  return !!(s.query || s.muscle || s.equipment) || s.scope !== 'all';
}

/** Filtered list for the toolbar state, plus "Ostatnio używane" (only when nothing is filtered). */
export function useExerciseFinder(all: Exercise[] | undefined, s: FinderState) {
  const pool = useScopedExercises(all, s.scope);
  const recentIds = useLiveQuery(() => getRecentExerciseIds(8), []);
  const isFiltered = isFinderFiltered(s);
  const filtered = useMemo(
    () =>
      filterExercises(pool, {
        query: s.query || undefined,
        muscle: s.muscle ?? undefined,
        equipment: s.equipment ?? undefined,
      }),
    [pool, s.query, s.muscle, s.equipment],
  );
  const recent = useMemo(() => {
    if (!all || !recentIds || isFiltered) return [];
    const byId = new Map(all.map((e) => [e.id, e]));
    return recentIds.map((id) => byId.get(id)).filter((e): e is Exercise => !!e);
  }, [all, recentIds, isFiltered]);
  return { filtered, recent, isFiltered };
}
