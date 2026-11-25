import { MUSCLE_GROUPS, muscleGroup, type MuscleGroup } from './muscleMap';
import { countedSets } from './records';
import { isFinished } from './workouts';
import type { StatsInput } from './stats';
import type { Workout } from './types';

// Weekly goal, week streak, sets per muscle in a week and the yearly activity calendar.
// Pure functions over existing history; weeks start Monday 00:00 local time.

export const DEFAULT_WEEKLY_GOAL = 3;

/** Local midnight of the Monday of the week containing `t`, shifted by `weeks` weeks. */
export function weekStartOf(t: number, weeks = 0): number {
  const d = new Date(t);
  const sinceMonday = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday + weeks * 7).getTime();
}

export function clampGoal(n: unknown): number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 7 ? n : DEFAULT_WEEKLY_GOAL;
}

/** Finished workouts per week, keyed by the week's Monday. */
export function workoutsPerWeek(workouts: Workout[]): Map<number, Workout[]> {
  const out = new Map<number, Workout[]>();
  for (const w of workouts) {
    if (!isFinished(w)) continue;
    const k = weekStartOf(w.startedAt);
    const list = out.get(k);
    if (list) list.push(w);
    else out.set(k, [w]);
  }
  return out;
}

export interface WeekProgress {
  done: number;
  goal: number;
  met: boolean;
  /** Weeks in a row with the goal met; the current week adds 1 once met and never breaks it. */
  streak: number;
}

export function weekProgress(workouts: Workout[], goal: number, now: number): WeekProgress {
  const perWeek = workoutsPerWeek(workouts);
  const thisWeek = weekStartOf(now);
  const done = perWeek.get(thisWeek)?.length ?? 0;
  const met = done >= goal;
  let streak = met ? 1 : 0;
  for (let i = -1; ; i--) {
    if ((perWeek.get(weekStartOf(now, i))?.length ?? 0) < goal) break;
    streak++;
  }
  return { done, goal, met, streak };
}

export type MuscleStatus = 'low' | 'ok' | 'high';

export const BAND_MIN = 10;
export const BAND_MAX = 20;

export function muscleStatus(sets: number): MuscleStatus {
  if (sets < BAND_MIN) return 'low';
  if (sets > BAND_MAX) return 'high';
  return 'ok';
}

export interface MuscleWeekRow {
  group: MuscleGroup;
  label: string;
  sets: number;
  status: MuscleStatus;
}

/** Working sets (reps, time or distance) per muscle group in the week starting at `weekStart`: primary 1, secondary 0.5. */
export function muscleWeek(input: StatsInput, weekStart: number): { rows: MuscleWeekRow[]; unmapped: number } {
  const end = weekStartOf(weekStart, 1);
  const ids = new Set(
    input.workouts.filter((w) => isFinished(w) && w.startedAt >= weekStart && w.startedAt < end).map((w) => w.id),
  );
  const totals = new Map<MuscleGroup, number>();
  let unmapped = 0;
  for (const s of countedSets(input.sets.filter((x) => ids.has(x.workoutId)))) {
    const m = input.muscles.get(s.exerciseId);
    const primary = new Set((m?.primary ?? []).map(muscleGroup).filter((g): g is MuscleGroup => !!g));
    if (primary.size === 0) unmapped++;
    const secondary = new Set((m?.secondary ?? []).map(muscleGroup).filter((g): g is MuscleGroup => !!g));
    for (const g of primary) totals.set(g, (totals.get(g) ?? 0) + 1);
    for (const g of secondary) if (!primary.has(g)) totals.set(g, (totals.get(g) ?? 0) + 0.5);
  }
  const rows = MUSCLE_GROUPS.map((g) => {
    const sets = totals.get(g.key) ?? 0;
    return { group: g.key, label: g.label, sets, status: muscleStatus(sets) };
  });
  return { rows, unmapped };
}

/** `YYYY-MM-DD` in local time. */
export function dayKey(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface DayActivity {
  sets: number;
  /** Oldest first. */
  workoutIds: string[];
}

/** Training days of a year with their working sets. */
export function yearActivity(input: StatsInput, year: number): Map<string, DayActivity> {
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  const workouts = input.workouts
    .filter((w) => isFinished(w) && w.startedAt >= start && w.startedAt < end)
    .sort((a, b) => a.startedAt - b.startedAt);
  const dayOf = new Map<string, string>();
  const out = new Map<string, DayActivity>();
  for (const w of workouts) {
    const k = dayKey(w.startedAt);
    dayOf.set(w.id, k);
    const a = out.get(k);
    if (a) a.workoutIds.push(w.id);
    else out.set(k, { sets: 0, workoutIds: [w.id] });
  }
  for (const s of countedSets(input.sets)) {
    const k = dayOf.get(s.workoutId);
    if (k) out.get(k)!.sets++;
  }
  return out;
}

/** Colour step of a training day (a day with only warm-ups still shows as step 1). */
export function activityLevel(sets: number): 1 | 2 | 3 | 4 {
  if (sets < 12) return 1;
  if (sets < 20) return 2;
  if (sets < 28) return 3;
  return 4;
}
