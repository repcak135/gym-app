import { db } from './db';
import { computeRecords, computeTimeDistanceRecords, type ExerciseRecords, type TimeDistanceRecords } from './records';
import { getExerciseHistory, getWorkoutSets, isFinished } from './workouts';
import type { Workout, WorkoutSet } from './types';

export interface WorkoutListItem {
  workout: Workout;
  /** Working sets (warm-ups excluded). */
  sets: number;
  exercises: number;
  /** Only for workouts logged in the app (imports have no duration). */
  durationSec?: number;
}

export function workoutDurationSec(w: Workout): number | undefined {
  if (w.source !== 'app' || w.endedAt === undefined) return undefined;
  return Math.max(0, Math.round((w.endedAt - w.startedAt) / 1000));
}

/** All finished workouts, newest first, with set/exercise counts. */
export async function listFinishedWorkouts(): Promise<WorkoutListItem[]> {
  const [workouts, sets] = await Promise.all([db.workouts.toArray(), db.sets.toArray()]);
  const counts = new Map<string, { sets: number; ex: Set<string> }>();
  for (const s of sets) {
    if (s.completedAt === undefined) continue;
    const c = counts.get(s.workoutId) ?? { sets: 0, ex: new Set<string>() };
    if (!s.warmup) c.sets++;
    c.ex.add(s.exerciseId);
    counts.set(s.workoutId, c);
  }
  return workouts
    .filter(isFinished)
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((workout) => {
      const c = counts.get(workout.id);
      return {
        workout,
        sets: c?.sets ?? 0,
        exercises: c?.ex.size ?? 0,
        durationSec: workoutDurationSec(workout),
      };
    });
}

/** Days of the month (1–31) that have a workout; month is 0-based. */
export function workoutDays(items: { workout: Workout }[], year: number, month: number): Set<number> {
  const days = new Set<number>();
  for (const { workout } of items) {
    const d = new Date(workout.startedAt);
    if (d.getFullYear() === year && d.getMonth() === month) days.add(d.getDate());
  }
  return days;
}

export interface WorkoutDetail {
  workout: Workout;
  groups: { exerciseId: string; sets: WorkoutSet[] }[];
}

export async function getWorkoutDetail(id: string): Promise<WorkoutDetail | undefined> {
  const workout = await db.workouts.get(id);
  if (!workout) return undefined;
  const sets = (await getWorkoutSets(id)).filter((s) => s.completedAt !== undefined);
  const groups: WorkoutDetail['groups'] = [];
  for (const s of sets) {
    const last = groups.at(-1);
    if (last && last.exerciseId === s.exerciseId) last.sets.push(s);
    else groups.push({ exerciseId: s.exerciseId, sets: [s] });
  }
  return { workout, groups };
}

export async function deleteWorkout(id: string): Promise<void> {
  await db.transaction('rw', db.workouts, db.sets, async () => {
    await db.sets.where('workoutId').equals(id).delete();
    await db.workouts.delete(id);
  });
}

/** Longest time / distance of an exercise; works for exercises without any rep sets. */
export async function getTimeDistanceRecords(exerciseId: string): Promise<TimeDistanceRecords> {
  return computeTimeDistanceRecords(await getExerciseHistory(exerciseId));
}

export async function getExerciseRecords(exerciseId: string): Promise<ExerciseRecords | null> {
  return computeRecords(await getExerciseHistory(exerciseId));
}
