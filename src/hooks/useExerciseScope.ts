import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '../data/db';
import type { Exercise } from '../data/types';

export type Scope = 'all' | 'moje' | 'uzywane';

export const SCOPE_OPTIONS: { key: Scope; label: string }[] = [
  { key: 'all', label: 'Wszystkie' },
  { key: 'moje', label: 'Moje' },
  { key: 'uzywane', label: 'Używane' },
];

/** Ids of exercises the user has used: in any logged set or any plan day. */
export function useUsedIds(): Set<string> | undefined {
  return useLiveQuery(async () => {
    const ids = new Set<string>((await db.sets.orderBy('exerciseId').uniqueKeys()) as string[]);
    for (const plan of await db.plans.toArray())
      for (const day of plan.days) for (const item of day.items) ids.add(item.exerciseId);
    return ids;
  }, []);
}

/** Narrows the list to the chosen scope (all / own / used). */
export function applyScope(all: Exercise[], scope: Scope, usedIds: Set<string> | undefined): Exercise[] {
  if (scope === 'moje') return all.filter((e) => e.custom);
  if (scope === 'uzywane') return all.filter((e) => usedIds?.has(e.id));
  return all;
}

export function useScopedExercises(all: Exercise[] | undefined, scope: Scope): Exercise[] {
  const usedIds = useUsedIds();
  return useMemo(() => (all ? applyScope(all, scope, usedIds) : []), [all, scope, usedIds]);
}

/** Text for an empty scope with no search/filter active. */
export function emptyScopeText(scope: Scope, withAddHint: boolean): string | null {
  if (scope === 'moje') {
    return `Nie masz jeszcze własnych ćwiczeń.${withAddHint ? ' Dodaj je przyciskiem + u góry.' : ''}`;
  }
  if (scope === 'uzywane') return 'Tu pojawią się ćwiczenia z Twoich planów i treningów.';
  return null;
}
