import { weekProgress, weekStartOf } from './motivation';
import { computeRecords, workingSets, type ExerciseRecords } from './records';
import type { StatsInput } from './stats';
import { findNewRecords, isFinished } from './workouts';
import type { Workout, WorkoutSet } from './types';

// Badges and per-exercise bests, computed from finished history (nothing stored).

export interface Badge {
  id: string;
  title: string;
  description: string;
  /** Start of the workout that earned it. */
  earnedAt?: number;
  workoutId?: string;
  /** For locked badges. */
  progress?: { current: number; target: number };
}

interface Def {
  id: string;
  title: string;
  description: string;
  target: number;
  metric: 'workouts' | 'run' | 'heaviest' | 'sets' | 'records';
}

const DEFS: Def[] = [
  { id: 'first', title: 'Pierwszy trening', description: 'Ukończ pierwszy trening', target: 1, metric: 'workouts' },
  { id: 'w10', title: '10 treningów', description: 'Ukończ 10 treningów', target: 10, metric: 'workouts' },
  { id: 'w50', title: '50 treningów', description: 'Ukończ 50 treningów', target: 50, metric: 'workouts' },
  { id: 'w100', title: '100 treningów', description: 'Ukończ 100 treningów', target: 100, metric: 'workouts' },
  { id: 'w250', title: '250 treningów', description: 'Ukończ 250 treningów', target: 250, metric: 'workouts' },
  { id: 'streak4', title: '4 tygodnie z rzędu', description: 'Zrealizuj cel tygodnia 4 tygodnie z rzędu', target: 4, metric: 'run' },
  { id: 'streak12', title: '12 tygodni z rzędu', description: 'Zrealizuj cel tygodnia 12 tygodni z rzędu', target: 12, metric: 'run' },
  { id: 'kg100', title: 'Pierwsze 100 kg', description: 'Zrób serię roboczą z ciężarem 100 kg lub więcej', target: 100, metric: 'heaviest' },
  { id: 'sets1000', title: '1000 serii', description: 'Zrób 1000 serii roboczych', target: 1000, metric: 'sets' },
  { id: 'rec10', title: '10 rekordów', description: 'Pobij 10 rekordów (ciężar, 1RM, objętość albo powtórzenia)', target: 10, metric: 'records' },
  { id: 'rec50', title: '50 rekordów', description: 'Pobij 50 rekordów', target: 50, metric: 'records' },
  { id: 'rec100', title: '100 rekordów', description: 'Pobij 100 rekordów', target: 100, metric: 'records' },
];

function finishedChronological(input: StatsInput): { workout: Workout; sets: WorkoutSet[] }[] {
  const byWorkout = new Map<string, WorkoutSet[]>();
  for (const s of input.sets) {
    if (s.completedAt === undefined) continue;
    const list = byWorkout.get(s.workoutId);
    if (list) list.push(s);
    else byWorkout.set(s.workoutId, [s]);
  }
  return input.workouts
    .filter(isFinished)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((workout) => ({ workout, sets: byWorkout.get(workout.id) ?? [] }));
}

export function computeBadges(input: StatsInput, goal: number, now: number): Badge[] {
  const totals = { workouts: 0, run: 0, heaviest: 0, sets: 0, records: 0 };
  const earned = new Map<string, { at: number; workoutId: string }>();
  const history = new Map<string, WorkoutSet[][]>(); // exercise → earlier workouts' sets
  const weekCount = new Map<number, number>();
  const weekRun = new Map<number, number>(); // week → streak length when its goal was met

  for (const { workout, sets } of finishedChronological(input)) {
    totals.workouts++;
    const work = workingSets(sets);
    totals.sets += work.length;
    for (const s of work) totals.heaviest = Math.max(totals.heaviest, s.weight);

    const week = weekStartOf(workout.startedAt);
    const count = (weekCount.get(week) ?? 0) + 1;
    weekCount.set(week, count);
    if (count === goal) {
      const run = (weekRun.get(weekStartOf(week, -1)) ?? 0) + 1;
      weekRun.set(week, run);
      totals.run = Math.max(totals.run, run);
    }

    const byExercise = new Map<string, WorkoutSet[]>();
    for (const s of sets) {
      const list = byExercise.get(s.exerciseId);
      if (list) list.push(s);
      else byExercise.set(s.exerciseId, [s]);
    }
    for (const [exerciseId, exSets] of byExercise) {
      const earlier = history.get(exerciseId) ?? [];
      totals.records += findNewRecords(exerciseId, exSets, earlier).length;
      earlier.push(exSets);
      history.set(exerciseId, earlier);
    }

    for (const def of DEFS) {
      if (!earned.has(def.id) && totals[def.metric] >= def.target) {
        earned.set(def.id, { at: workout.startedAt, workoutId: workout.id });
      }
    }
  }

  const currentStreak = weekProgress(input.workouts, goal, now).streak;
  return DEFS.map((def) => {
    const e = earned.get(def.id);
    const base = { id: def.id, title: def.title, description: def.description };
    if (e) return { ...base, earnedAt: e.at, workoutId: e.workoutId };
    const current = def.metric === 'run' ? currentStreak : totals[def.metric];
    return { ...base, progress: { current: Math.min(Math.floor(current), def.target), target: def.target } };
  });
}

export interface ExerciseBest {
  exerciseId: string;
  records: ExerciseRecords;
  /** Start of the last finished workout with a working set of this exercise. */
  lastAt: number;
}

/** Personal bests of every exercise done, most recently trained first. */
export function exerciseBests(input: StatsInput): ExerciseBest[] {
  const perExercise = new Map<string, { workout: Workout; sets: WorkoutSet[] }[]>();
  for (const { workout, sets } of finishedChronological(input)) {
    const byExercise = new Map<string, WorkoutSet[]>();
    for (const s of sets) {
      const list = byExercise.get(s.exerciseId);
      if (list) list.push(s);
      else byExercise.set(s.exerciseId, [s]);
    }
    for (const [id, exSets] of byExercise) {
      const list = perExercise.get(id) ?? [];
      list.push({ workout, sets: exSets });
      perExercise.set(id, list);
    }
  }
  const out: ExerciseBest[] = [];
  for (const [exerciseId, history] of perExercise) {
    const records = computeRecords(history);
    if (!records) continue;
    const lastAt = Math.max(...history.filter((h) => workingSets(h.sets).length > 0).map((h) => h.workout.startedAt));
    out.push({ exerciseId, records, lastAt });
  }
  return out.sort((a, b) => b.lastAt - a.lastAt);
}
