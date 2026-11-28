import { dots, type Sex } from '../data/dots';
import { isFinished } from '../data/workouts';
import type { BodyEntry, Workout, WorkoutSet } from '../data/types';

/** The classic flat barbell bench only (fair table): not dumbbell, incline, decline, Smith, boards or bands. */
export const BENCH_IDS = new Set([
  'Barbell_Bench_Press_-_Medium_Grip',
  'Wide-Grip_Barbell_Bench_Press',
  'Close-Grip_Barbell_Bench_Press',
  'og-0122', // Barbell Wide Bench Press (merged into Wide-Grip_Barbell_Bench_Press since catalogue 9; kept for old data)
  'og-5013', // Barbell Pause Bench Press
  'og-6584', // Barbell Feet Flat Bench Press
]);

export type ScorePayload = {
  week: string;
  month: string;
  workoutsWeek?: number;
  workoutsMonth?: number;
  /** All-time best bench DOTS points (owner, 2026-11-28: the bench table is all-time). */
  benchBest?: number;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO week of the local date, Monday–Sunday: "2026-W48". */
export function isoWeekKey(t: number): string {
  const d = new Date(t);
  // Thursday of this week decides the ISO year; noon avoids DST edges.
  const thu = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) + 3, 12);
  const jan1 = new Date(thu.getFullYear(), 0, 1, 12);
  const week = Math.floor(Math.round((thu.getTime() - jan1.getTime()) / 86_400_000) / 7) + 1;
  return `${thu.getFullYear()}-W${pad(week)}`;
}

export function monthKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Local calendar day "YYYY-MM-DD" (Ciało entries use the same format). */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function hasBodyWeight(entries: BodyEntry[]): boolean {
  return entries.some((e) => typeof e.weightKg === 'number' && e.weightKg > 0);
}

/**
 * Body weight on a day: the latest Ciało entry on or before it, else the earliest one after it
 * (owner's rule, 2026-11-28). undefined when there is no weight at all.
 */
export function bodyWeightAt(entries: BodyEntry[], day: string): number | undefined {
  const withWeight = entries.filter((e) => typeof e.weightKg === 'number' && e.weightKg > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let before: BodyEntry | undefined;
  for (const e of withWeight) if (e.date <= day) before = e;
  return (before ?? withWeight[0])?.weightKg;
}

/** A completed working set with ≥ 1 rep on the flat barbell bench (never an estimated 1RM). */
export function countsForBench(s: WorkoutSet): boolean {
  return BENCH_IDS.has(s.exerciseId) && !s.warmup && s.completedAt !== undefined && s.reps >= 1 && s.weight > 0;
}

/**
 * All-time best bench DOTS: every qualifying set in a finished workout, each with the body weight of
 * its day; the best points win (a lighter lift at a lower body weight can beat a heavier one).
 */
export function bestBenchPoints(sets: WorkoutSet[], workouts: Map<string, Workout>, body: BodyEntry[], sex: Sex): number | undefined {
  let best: number | undefined;
  for (const s of sets) {
    const w = workouts.get(s.workoutId);
    if (!w || !isFinished(w) || !countsForBench(s)) continue;
    const bw = bodyWeightAt(body, dayKey(w.startedAt));
    if (!bw) continue;
    const p = Math.round(dots(s.weight, bw, sex) * 100) / 100;
    if (best === undefined || p > best) best = p;
  }
  return best;
}

/**
 * The scores this phone should have on the server now. `workouts` must hold every finished workout of
 * the current week and month plus every workout that has a bench set; `sets` the bench sets ever.
 */
export function computeScores(
  input: { workouts: Workout[]; sets: WorkoutSet[]; body: BodyEntry[] },
  now: number,
  share: { workouts: boolean; bench: boolean },
  sex: Sex | undefined,
): ScorePayload {
  const week = isoWeekKey(now);
  const month = monthKey(now);
  const out: ScorePayload = { week, month };
  if (share.workouts) {
    const done = input.workouts.filter(isFinished);
    out.workoutsWeek = done.filter((w) => isoWeekKey(w.startedAt) === week).length;
    out.workoutsMonth = done.filter((w) => monthKey(w.startedAt) === month).length;
  }
  if (share.bench && sex) {
    const best = bestBenchPoints(input.sets, new Map(input.workouts.map((w) => [w.id, w])), input.body, sex);
    if (best !== undefined) out.benchBest = best;
  }
  return out;
}
