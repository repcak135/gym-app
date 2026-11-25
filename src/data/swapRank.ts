import type { Exercise } from './types';
import { deltHeadsOf } from './deltHeads';

/**
 * Swapping an exercise during a workout: alternatives for the same muscle come first.
 * Order inside each group: same equipment, then exercises the user has used, then the
 * list's own order (alphabetical / search result). Nothing is removed — search still finds everything.
 */
export function rankForSwap(
  list: Exercise[],
  replaced: Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles' | 'equipment' | 'delts'>,
  usedIds?: Set<string>,
): { similar: Exercise[]; rest: Exercise[] } {
  const muscles = new Set(baseMuscles(replaced));
  const heads = new Set(deltHeadsOf(replaced, 'primary'));
  const score = (e: Exercise) =>
    (replaced.equipment && e.equipment === replaced.equipment ? 2 : 0) + (usedIds?.has(e.id) ? 1 : 0);
  // Array.prototype.sort is stable, so ties keep the incoming order.
  const byScore = (a: Exercise, b: Exercise) => score(b) - score(a);
  const sameHead: Exercise[] = [];
  const similar: Exercise[] = [];
  const rest: Exercise[] = [];
  for (const e of list) {
    if (heads.size > 0 && deltHeadsOf(e, 'primary').some((h) => heads.has(h))) sameHead.push(e);
    else (muscles.size > 0 && e.primaryMuscles.some((m) => muscles.has(m)) ? similar : rest).push(e);
  }
  // Known deltoid head: exercises with the same primary head first, then other shoulder exercises.
  return { similar: [...sameHead.sort(byScore), ...similar.sort(byScore)], rest: rest.sort(byScore) };
}

/** Muscles that define "similar": the primary ones, or the secondary ones when none is primary. */
function baseMuscles(e: Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles'>): string[] {
  return e.primaryMuscles.length > 0 ? e.primaryMuscles : e.secondaryMuscles;
}

/** Same, as filter keys: "shoulders" becomes "shoulders:side" etc. when the primary heads are known. */
export function swapMuscles(e: Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles' | 'delts'>): string[] {
  const heads = deltHeadsOf(e, 'primary');
  return baseMuscles(e).flatMap((m) =>
    m === 'shoulders' && heads.length > 0 ? heads.map((h) => `shoulders:${h}`) : [m],
  );
}
