import { dots, type Sex } from '../data/dots';
import { isFinished } from '../data/workouts';
import type { BodyEntry, Workout, WorkoutSet } from '../data/types';

/** The classic flat barbell bench only (fair table): not dumbbell, incline, decline, Smith, boards or bands. */
export const BENCH_IDS = new Set([
  'Barbell_Bench_Press_-_Medium_Grip',
  'Wide-Grip_Barbell_Bench_Press',
  'Close-Grip_Barbell_Bench_Press',
  'og-0122', // Barbell Wide Bench Press
  'og-5013', // Barbell Pause Bench Press
  'og-6584', // Barbell Feet Flat Bench Press
]);

/** A body weight older than this is not used for points. */
export const BODY_MAX_AGE_DAYS = 60;

export type ScorePayload = {
  week: string;
  month: string;
  workoutsWeek?: number;
  workoutsMonth?: number;
  benchWeek?: number;
  benchMonth?: number;
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

/** Latest Ciało weight if it is at most 60 days old. */
export function recentBodyWeight(entries: BodyEntry[], now: number): number | undefined {
  const withWeight = entries.filter((e) => typeof e.weightKg === 'number' && e.weightKg > 0).sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = withWeight[0];
  if (!latest) return undefined;
  const [y, m, d] = latest.date.split('-').map(Number);
  const age = (now - new Date(y, m - 1, d).getTime()) / 86_400_000;
  return age <= BODY_MAX_AGE_DAYS ? latest.weightKg : undefined;
}

/** Heaviest completed working set with ≥ 1 rep (100×1 beats 80×12; never an estimated 1RM). */
export function heaviestBench(sets: WorkoutSet[], workoutIds: Set<string>): number | undefined {
  let best: number | undefined;
  for (const s of sets) {
    if (!workoutIds.has(s.workoutId) || !BENCH_IDS.has(s.exerciseId)) continue;
    if (s.warmup || s.completedAt === undefined || !(s.reps >= 1) || !(s.weight > 0)) continue;
    if (best === undefined || s.weight > best) best = s.weight;
  }
  return best;
}

export function computeScores(
  input: { workouts: Workout[]; sets: WorkoutSet[]; body: BodyEntry[] },
  now: number,
  share: { workouts: boolean; bench: boolean },
  sex: Sex | undefined,
): ScorePayload {
  const week = isoWeekKey(now);
  const month = monthKey(now);
  const done = input.workouts.filter(isFinished);
  const inWeek = new Set(done.filter((w) => isoWeekKey(w.startedAt) === week).map((w) => w.id));
  const inMonth = new Set(done.filter((w) => monthKey(w.startedAt) === month).map((w) => w.id));
  const out: ScorePayload = { week, month };
  if (share.workouts) {
    out.workoutsWeek = inWeek.size;
    out.workoutsMonth = inMonth.size;
  }
  const bw = recentBodyWeight(input.body, now);
  if (share.bench && sex && bw) {
    const points = (ids: Set<string>) => {
      const kg = heaviestBench(input.sets, ids);
      return kg === undefined ? undefined : Math.round(dots(kg, bw, sex) * 100) / 100;
    };
    const w = points(inWeek);
    const m = points(inMonth);
    if (w !== undefined) out.benchWeek = w;
    if (m !== undefined) out.benchMonth = m;
  }
  return out;
}
