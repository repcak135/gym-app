import { rirToRpeLabel } from './difficulty';
import { epley1RM } from './progression';
import { findNewRecords } from './workouts';
import type { Workout, WorkoutSet } from './types';

// Per-exercise history shown as a vertical list: one session per block, one row per set.

const WEEKDAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const MONTHS_GEN = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];

/** "piątek, 6 listopada"; the year is added when it is not the current one ("…, 6 listopada 2025"). */
export function formatSessionDate(t: number, now = Date.now()): string {
  const d = new Date(t);
  const year = d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${year}`;
}

export interface HistoryRow {
  id: string;
  /** 1-based position in the session (warm-ups included). */
  n: number;
  weight: number;
  reps: number;
  warmup: boolean;
  /** "RPE 8" when the set has a difficulty. */
  rpe?: string;
  /** The set that set a record in this session (heaviest weight, 1RM or more reps at a weight). */
  record: boolean;
}

export interface HistorySession {
  workout: Workout;
  rows: HistoryRow[];
}

/**
 * Sessions newest first (as `getExerciseHistory` returns them) with numbered rows and record flags.
 * Records follow the finish-summary rules: the exercise's first session never counts.
 */
export function historySessions(history: { workout: Workout; sets: WorkoutSet[] }[]): HistorySession[] {
  const oldestFirst = [...history].sort((a, b) => a.workout.startedAt - b.workout.startedAt);
  const recordIds = new Map<string, Set<string>>();
  const earlier: WorkoutSet[][] = [];
  for (const { workout, sets } of oldestFirst) {
    const marked = new Set<string>();
    const done = sets.filter((s) => !s.warmup && s.completedAt !== undefined && s.reps > 0);
    for (const r of findNewRecords('', sets, earlier)) {
      let hit: WorkoutSet | undefined;
      if (r.kind === 'weight') hit = done.reduce<WorkoutSet | undefined>((b, s) => (!b || s.weight > b.weight ? s : b), undefined);
      else if (r.kind === 'e1rm') {
        hit = done.reduce<WorkoutSet | undefined>(
          (b, s) => (!b || epley1RM(s.weight, s.reps) > epley1RM(b.weight, b.reps) ? s : b),
          undefined,
        );
      } else if (r.kind === 'reps') hit = done.find((s) => s.weight === r.weight && s.reps === r.reps);
      if (hit) marked.add(hit.id);
    }
    recordIds.set(workout.id, marked);
    earlier.push(sets);
  }
  return history.map(({ workout, sets }) => ({
    workout,
    rows: sets.map((s, i) => ({
      id: s.id,
      n: i + 1,
      weight: s.weight,
      reps: s.reps,
      warmup: s.warmup,
      rpe: s.rir !== undefined ? rirToRpeLabel(s.rir) : undefined,
      record: recordIds.get(workout.id)?.has(s.id) ?? false,
    })),
  }));
}
