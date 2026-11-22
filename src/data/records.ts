import { epley1RM } from './progression';
import type { Workout, WorkoutSet } from './types';

// Personal records from finished history (pure; warm-ups and 0-rep sets never count).

export interface ExerciseRecords {
  heaviest: { weight: number; reps: number; at: number };
  e1rm: { value: number; weight: number; reps: number; at: number };
  volume: { value: number; at: number };
  /** Most reps ever done at each weight, heaviest weight first (max 6 rows). */
  repsAtWeight: { weight: number; reps: number; at: number }[];
}

export const REPS_AT_WEIGHT_ROWS = 6;

export function workingSets(sets: WorkoutSet[]): WorkoutSet[] {
  return sets.filter((s) => !s.warmup && s.completedAt !== undefined && s.reps > 0);
}

export function computeRecords(history: { workout: Workout; sets: WorkoutSet[] }[]): ExerciseRecords | null {
  let heaviest: ExerciseRecords['heaviest'] | null = null;
  let e1rm: ExerciseRecords['e1rm'] | null = null;
  let volume: ExerciseRecords['volume'] | null = null;
  const byWeight = new Map<number, { weight: number; reps: number; at: number }>();
  // Oldest first, so ties keep the date it was first achieved.
  const ordered = [...history].sort((a, b) => a.workout.startedAt - b.workout.startedAt);
  for (const { workout, sets } of ordered) {
    const at = workout.startedAt;
    const work = workingSets(sets);
    if (work.length === 0) continue;
    let vol = 0;
    for (const s of work) {
      vol += s.weight * s.reps;
      if (!heaviest || s.weight > heaviest.weight || (s.weight === heaviest.weight && s.reps > heaviest.reps)) {
        heaviest = { weight: s.weight, reps: s.reps, at };
      }
      const est = epley1RM(s.weight, s.reps);
      if (!e1rm || est > e1rm.value) e1rm = { value: est, weight: s.weight, reps: s.reps, at };
      const prev = byWeight.get(s.weight);
      if (!prev || s.reps > prev.reps) byWeight.set(s.weight, { weight: s.weight, reps: s.reps, at });
    }
    vol = Math.round(vol * 10) / 10;
    if (!volume || vol > volume.value) volume = { value: vol, at };
  }
  if (!heaviest || !e1rm || !volume) return null;
  const repsAtWeight = [...byWeight.values()].sort((a, b) => b.weight - a.weight).slice(0, REPS_AT_WEIGHT_ROWS);
  return { heaviest, e1rm, volume, repsAtWeight };
}
