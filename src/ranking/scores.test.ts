import { describe, expect, it } from 'vitest';
import { bestBenchPoints, bodyWeightAt, computeScores, isoWeekKey, monthKey } from './scores';
import { dots } from '../data/dots';
import type { BodyEntry, Workout, WorkoutSet } from '../data/types';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const BENCH = 'Barbell_Bench_Press_-_Medium_Grip';
const pts = (kg: number, bw: number, sex: 'm' | 'f' = 'm') => Math.round(dots(kg, bw, sex) * 100) / 100;

let n = 0;
const workout = (t: number, finished = true, id = `w${n++}`): Workout => ({ id, name: 'A', startedAt: t, endedAt: finished ? t + 3600_000 : undefined, source: 'app' });
const set = (workoutId: string, weight: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet =>
  ({ id: `s${n++}`, workoutId, exerciseId: BENCH, exerciseOrder: 0, setOrder: 0, weight, reps, warmup: false, completedAt: 1, ...extra }) as WorkoutSet;
const body = (date: string, weightKg?: number): BodyEntry => ({ id: date, date, weightKg, measurements: {} });
const byId = (...ws: Workout[]) => new Map(ws.map((w) => [w.id, w]));

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

describe('body weight on the day of a lift', () => {
  const entries = [body('2026-03-01', 90), body('2026-06-01', 85), body('2026-06-15'), body('2026-09-01', 80)];
  it('latest entry on or before that day', () => {
    expect(bodyWeightAt(entries, '2026-06-01')).toBe(85);
    expect(bodyWeightAt(entries, '2026-08-31')).toBe(85); // the 15 June entry has no weight
    expect(bodyWeightAt(entries, '2027-01-01')).toBe(80);
  });
  it('else the earliest entry after it; none at all → undefined', () => {
    expect(bodyWeightAt(entries, '2025-01-01')).toBe(90);
    expect(bodyWeightAt([], '2026-01-01')).toBeUndefined();
  });
});

describe('all-time bench', () => {
  it('heaviest qualifying set, any date: 100×1 beats 80×12', () => {
    const old = workout(at(2024, 5, 1));
    const now = workout(at(2026, 11, 24));
    const b = [body('2024-01-01', 80)];
    expect(bestBenchPoints([set(now.id, 80, 12), set(old.id, 100, 1)], byId(old, now), b, 'm')).toBe(pts(100, 80));
  });

  it('uses the body weight of the lift day, so the best points win', () => {
    const heavy = workout(at(2025, 1, 10)); // 110 kg at 110 kg body weight
    const light = workout(at(2026, 6, 10)); // 100 kg at 75 kg body weight
    const b = [body('2025-01-01', 110), body('2026-06-01', 75)];
    const best = bestBenchPoints([set(heavy.id, 110, 1), set(light.id, 100, 1)], byId(heavy, light), b, 'm');
    expect(best).toBe(pts(100, 75));
    expect(pts(100, 75)).toBeGreaterThan(pts(110, 110));
  });

  it('ignores warm-ups, 0-rep sets, unfinished sets, unfinished workouts and other exercises', () => {
    const w = workout(at(2026, 11, 24));
    const open = workout(at(2026, 11, 25), false);
    const sets = [
      set(w.id, 200, 3, { warmup: true }),
      set(w.id, 190, 0),
      set(w.id, 180, 5, { completedAt: undefined }),
      set(w.id, 170, 5, { exerciseId: 'Dumbbell_Bench_Press' }),
      set(w.id, 160, 5, { exerciseId: 'Barbell_Incline_Bench_Press_-_Medium_Grip' }),
      set(open.id, 150, 5),
      set('missing', 150, 5),
      set(w.id, 90, 5),
    ];
    expect(bestBenchPoints(sets, byId(w, open), [body('2026-11-01', 80)], 'm')).toBe(pts(90, 80));
  });

  it('no body weight at all: no points', () => {
    const w = workout(at(2026, 11, 24));
    expect(bestBenchPoints([set(w.id, 100, 1)], byId(w), [], 'm')).toBeUndefined();
  });
});

describe('computeScores', () => {
  const now = at(2026, 11, 27);
  const thisWeek = workout(at(2026, 11, 24));
  const lastWeek = workout(at(2026, 11, 10));
  const lastYear = workout(at(2025, 10, 30));
  const unfinished = workout(at(2026, 11, 26), false);
  const input = {
    workouts: [thisWeek, lastWeek, lastYear, unfinished],
    sets: [set(thisWeek.id, 100, 3), set(lastWeek.id, 110, 1), set(lastYear.id, 150, 1)],
    body: [body('2025-10-01', 95), body('2026-11-20', 80)],
  };

  it('workouts per week and month; bench is the all-time best with the weight of each day', () => {
    expect(computeScores(input, now, { workouts: true, bench: true }, 'm')).toEqual({
      week: '2026-W48',
      month: '2026-11',
      workoutsWeek: 1,
      workoutsMonth: 2,
      benchBest: Math.max(pts(100, 80), pts(110, 95), pts(150, 95)),
    });
  });

  it('sends only what is shared', () => {
    expect(computeScores(input, now, { workouts: false, bench: false }, 'm')).toEqual({ week: '2026-W48', month: '2026-11' });
    expect(computeScores(input, now, { workouts: true, bench: false }, 'f')).not.toHaveProperty('benchBest');
    expect(computeScores(input, now, { workouts: false, bench: true }, 'f')).not.toHaveProperty('workoutsWeek');
  });

  it('no sex or no body weight: no bench; no bench set ever: no bench', () => {
    expect(computeScores(input, now, { workouts: true, bench: true }, undefined)).not.toHaveProperty('benchBest');
    expect(computeScores({ ...input, body: [] }, now, { workouts: true, bench: true }, 'm')).not.toHaveProperty('benchBest');
    expect(computeScores({ ...input, sets: [] }, now, { workouts: true, bench: true }, 'm')).not.toHaveProperty('benchBest');
  });
});
