import { describe, expect, it } from 'vitest';
import { computeScores, heaviestBench, isoWeekKey, monthKey, recentBodyWeight } from './scores';
import { dots } from '../data/dots';
import type { BodyEntry, Workout, WorkoutSet } from '../data/types';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const BENCH = 'Barbell_Bench_Press_-_Medium_Grip';

let n = 0;
const workout = (t: number, finished = true, id = `w${n++}`): Workout => ({ id, name: 'A', startedAt: t, endedAt: finished ? t + 3600_000 : undefined, source: 'app' });
const set = (workoutId: string, weight: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet =>
  ({ id: `s${n++}`, workoutId, exerciseId: BENCH, exerciseOrder: 0, setOrder: 0, weight, reps, warmup: false, completedAt: 1, ...extra }) as WorkoutSet;
const body = (date: string, weightKg?: number): BodyEntry => ({ id: date, date, weightKg, measurements: {} });

describe('periods', () => {
  it('ISO weeks run Monday 00:00 to Sunday 23:59 local', () => {
    expect(isoWeekKey(at(2026, 11, 23, 0))).toBe('2026-W48'); // Monday
    expect(isoWeekKey(at(2026, 11, 29, 23))).toBe('2026-W48'); // Sunday
    expect(isoWeekKey(at(2026, 11, 30, 0))).toBe('2026-W49');
  });

  it('handles the year edges (ISO rules)', () => {
    expect(isoWeekKey(at(2027, 1, 1))).toBe('2026-W53'); // Friday 1 Jan 2027
    expect(isoWeekKey(at(2025, 12, 29))).toBe('2026-W01'); // Monday
    expect(isoWeekKey(at(2026, 1, 1))).toBe('2026-W01');
    expect(monthKey(at(2026, 11, 30))).toBe('2026-11');
  });
});

describe('bench', () => {
  it('heaviest completed working set with ≥ 1 rep: 100×1 beats 80×12', () => {
    const w = workout(at(2026, 11, 24));
    const ids = new Set([w.id]);
    expect(heaviestBench([set(w.id, 80, 12), set(w.id, 100, 1)], ids)).toBe(100);
  });

  it('ignores warm-ups, 0-rep sets, unfinished sets, other exercises and other workouts', () => {
    const w = workout(at(2026, 11, 24));
    const sets = [
      set(w.id, 200, 3, { warmup: true }),
      set(w.id, 190, 0),
      set(w.id, 180, 5, { completedAt: undefined }),
      set(w.id, 170, 5, { exerciseId: 'Dumbbell_Bench_Press' }),
      set(w.id, 160, 5, { exerciseId: 'Barbell_Incline_Bench_Press_-_Medium_Grip' }),
      set('other', 150, 5),
      set(w.id, 90, 5),
    ];
    expect(heaviestBench(sets, new Set([w.id]))).toBe(90);
  });
});

describe('body weight', () => {
  it('latest entry with a weight, at most 60 days old', () => {
    const now = at(2026, 11, 27);
    expect(recentBodyWeight([body('2026-10-01', 80), body('2026-11-20', 82), body('2026-11-25')], now)).toBe(82);
    expect(recentBodyWeight([body('2026-09-01', 80)], now)).toBeUndefined();
    expect(recentBodyWeight([], now)).toBeUndefined();
  });
});

describe('computeScores', () => {
  const now = at(2026, 11, 27);
  const thisWeek = workout(at(2026, 11, 24));
  const lastWeek = workout(at(2026, 11, 10));
  const lastMonth = workout(at(2026, 10, 30));
  const unfinished = workout(at(2026, 11, 26), false);
  const input = {
    workouts: [thisWeek, lastWeek, lastMonth, unfinished],
    sets: [set(thisWeek.id, 100, 3), set(lastWeek.id, 110, 1), set(lastMonth.id, 150, 1)],
    body: [body('2026-11-20', 80)],
  };

  it('counts finished workouts and bench points per period', () => {
    expect(computeScores(input, now, { workouts: true, bench: true }, 'm')).toEqual({
      week: '2026-W48',
      month: '2026-11',
      workoutsWeek: 1,
      workoutsMonth: 2,
      benchWeek: Math.round(dots(100, 80, 'm') * 100) / 100,
      benchMonth: Math.round(dots(110, 80, 'm') * 100) / 100,
    });
  });

  it('sends only what is shared', () => {
    expect(computeScores(input, now, { workouts: false, bench: false }, 'm')).toEqual({ week: '2026-W48', month: '2026-11' });
    expect(computeScores(input, now, { workouts: true, bench: false }, 'f')).not.toHaveProperty('benchWeek');
  });

  it('no recent body weight or no sex: workouts only, never bench', () => {
    const r = computeScores({ ...input, body: [body('2026-08-01', 80)] }, now, { workouts: true, bench: true }, 'm');
    expect(r).not.toHaveProperty('benchWeek');
    expect(r.workoutsWeek).toBe(1);
    expect(computeScores(input, now, { workouts: true, bench: true }, undefined)).not.toHaveProperty('benchMonth');
  });

  it('a period without a bench set has no bench value (row removed on the server)', () => {
    const r = computeScores({ ...input, sets: [set(lastWeek.id, 110, 1)] }, now, { workouts: true, bench: true }, 'm');
    expect(r).not.toHaveProperty('benchWeek');
    expect(r.benchMonth).toBeGreaterThan(0);
  });
});
