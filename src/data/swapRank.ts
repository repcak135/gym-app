import type { Exercise } from './types';

/**
 * Swapping an exercise during a workout: alternatives for the same muscle come first.
 * Order inside each group: same equipment, then exercises the user has used, then the
 * list's own order (alphabetical / search result). Nothing is removed — search still finds everything.
 */
export function rankForSwap(
  list: Exercise[],
  replaced: Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles' | 'equipment'>,
  usedIds?: Set<string>,
): { similar: Exercise[]; rest: Exercise[] } {
  const muscles = new Set(swapMuscles(replaced));
  const score = (e: Exercise) =>
    (replaced.equipment && e.equipment === replaced.equipment ? 2 : 0) + (usedIds?.has(e.id) ? 1 : 0);
  // Array.prototype.sort is stable, so ties keep the incoming order.
  const byScore = (a: Exercise, b: Exercise) => score(b) - score(a);
  const similar: Exercise[] = [];
  const rest: Exercise[] = [];
  for (const e of list) (muscles.size > 0 && e.primaryMuscles.some((m) => muscles.has(m)) ? similar : rest).push(e);
  return { similar: similar.sort(byScore), rest: rest.sort(byScore) };
}

/** Muscles that define "similar": the primary ones, or the secondary ones when none is primary. */
export function swapMuscles(e: Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles'>): string[] {
  return e.primaryMuscles.length > 0 ? e.primaryMuscles : e.secondaryMuscles;
}
