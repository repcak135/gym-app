import type { AfterExerciseDone } from './types';

export interface ExerciseProgress {
  /** Completed sets (warm-ups included). */
  completed: number;
  /** All sets (warm-ups included). */
  total: number;
}

export type AfterDoneAction = { kind: 'stay' } | { kind: 'list' } | { kind: 'exercise'; index: number };

export const isExerciseDone = (p: ExerciseProgress): boolean => p.total > 0 && p.completed >= p.total;

/** "seria" / "serie" / "serii" for a count of sets. */
export function setsWord(n: number): string {
  const last = n % 10;
  const last2 = n % 100;
  if (n === 1) return 'seria';
  return last >= 2 && last <= 4 && !(last2 >= 12 && last2 <= 14) ? 'serie' : 'serii';
}

/** What to do when the exercise at `currentIndex` was just finished. */
export function nextAfterExerciseDone(
  progress: ExerciseProgress[],
  currentIndex: number,
  mode: AfterExerciseDone,
): AfterDoneAction {
  if (mode === 'stay') return { kind: 'stay' };
  if (mode === 'list') return { kind: 'list' };
  const n = progress.length;
  for (let step = 1; step < n; step++) {
    const i = (currentIndex + step) % n; // forward first, then wrap to the start
    if (progress[i].completed < progress[i].total) return { kind: 'exercise', index: i };
  }
  return { kind: 'list' };
}
