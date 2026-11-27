import type { Workout, WorkoutSet } from '../data/types';

export const REST_PUSH_TITLE = 'Koniec przerwy';
export const REST_PUSH_FALLBACK = 'Czas na kolejną serię';

/**
 * Body of the "Koniec przerwy" notification: the next undone set, looking from the current
 * exercise onward ("Seria 3 · Przysiad", "Rozgrzewka · Przysiad"), else a generic line.
 */
export function restPushBody(workout: Workout, sets: WorkoutSet[], nameOf: (exerciseId: string) => string | undefined): string {
  const exercises = workout.exercises ?? [];
  const n = exercises.length;
  const start = Math.min(Math.max(workout.currentIndex ?? 0, 0), Math.max(n - 1, 0)) || 0;
  for (let k = 0; k < n; k++) {
    const order = (start + k) % n;
    const mine = sets.filter((s) => s.exerciseOrder === order).sort((a, b) => a.setOrder - b.setOrder);
    const next = mine.find((s) => s.completedAt === undefined);
    if (!next) continue;
    const name = nameOf(next.exerciseId);
    if (!name) return REST_PUSH_FALLBACK;
    if (next.warmup) return `Rozgrzewka · ${name}`;
    const nr = mine.filter((s) => !s.warmup).indexOf(next) + 1;
    return `Seria ${nr} · ${name}`;
  }
  return REST_PUSH_FALLBACK;
}
