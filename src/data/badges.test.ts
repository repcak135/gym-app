import { describe, expect, it } from 'vitest';
import { computeBadges, exerciseBests } from './badges';
import type { StatsInput } from './stats';
import type { Workout, WorkoutSet } from './types';

const DAY = 86_400_000;
const d = (y: number, m: number, day: number, h = 18) => new Date(y, m - 1, day, h).getTime();
const NOW = d(2026, 11, 18, 12);

let n = 0;
function w(at: number, extra: Partial<Workout> = {}): Workout {
  n++;
  return { id: `w${n}`, name: 'T', startedAt: at, endedAt: at + 3600_000, source: 'import', ...extra };
}
function s(workoutId: string, exerciseId: string, weight: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet {
  n++;
  return { id: `s${n}`, workoutId, exerciseId, exerciseOrder: 0, setOrder: n, weight, reps, warmup: false, completedAt: 1, ...extra };
}
const input = (workouts: Workout[], sets: WorkoutSet[]): StatsInput => ({ workouts, sets, muscles: new Map() });
const badge = (list: ReturnType<typeof computeBadges>, id: string) => list.find((b) => b.id === id)!;

describe('computeBadges', () => {
  it('first workout badge dated by the first finished workout', () => {
    const live = w(d(2026, 1, 1), { source: 'app', endedAt: undefined });
    const a = w(d(2026, 2, 1));
    const b = w(d(2026, 3, 1));
    const list = computeBadges(input([b, live, a], []), 3, NOW);
    expect(badge(list, 'first')).toMatchObject({ earnedAt: a.startedAt, workoutId: a.id });
  });

  it('10 workouts badge on the 10th, progress 9/10 before', () => {
    const ws = Array.from({ length: 10 }, (_, i) => w(d(2026, 1, 1) + i * 10 * DAY));
    const before = badge(computeBadges(input(ws.slice(0, 9), []), 3, NOW), 'w10');
    expect(before.earnedAt).toBeUndefined();
    expect(before.progress).toEqual({ current: 9, target: 10 });
    expect(badge(computeBadges(input(ws, []), 3, NOW), 'w10').workoutId).toBe(ws[9].id);
  });

  it('100 kg badge ignores warm-ups and unfinished sets', () => {
    const a = w(d(2026, 1, 5));
    const b = w(d(2026, 1, 12));
    const sets = [
      s(a.id, 'sq', 100, 5, { warmup: true }),
      s(a.id, 'sq', 120, 5, { completedAt: undefined }),
      s(a.id, 'sq', 90, 5),
      s(b.id, 'sq', 100, 3),
    ];
    const list = computeBadges(input([a, b], sets), 3, NOW);
    expect(badge(list, 'kg100').workoutId).toBe(b.id);
  });

  it('1000 sets badge', () => {
    const a = w(d(2026, 1, 5));
    const b = w(d(2026, 1, 12));
    const sets = [
      ...Array.from({ length: 999 }, () => s(a.id, 'x', 10, 10)),
      s(b.id, 'x', 10, 10),
    ];
    const list = computeBadges(input([a, b], sets), 3, NOW);
    expect(badge(list, 'sets1000').workoutId).toBe(b.id);
  });

  it('4-week streak badge dated by the workout that met the 4th week', () => {
    // Mondays 5, 12, 19, 26 Jan 2026; two workouts a week, goal 2
    const ws: Workout[] = [];
    for (const mon of [5, 12, 19, 26]) ws.push(w(d(2026, 1, mon)), w(d(2026, 1, mon + 2)));
    const list = computeBadges(input(ws, []), 2, NOW);
    expect(badge(list, 'streak4')).toMatchObject({ workoutId: ws[7].id });
    expect(badge(list, 'streak12').progress).toEqual({ current: 0, target: 12 });
    // a gap week resets the run
    const gap = [...ws.slice(0, 4), ...ws.slice(6)]; // week of 19 Jan missing
    expect(badge(computeBadges(input(gap, []), 2, NOW), 'streak4').earnedAt).toBeUndefined();
  });

  it('records count matches summary rules (first time never counts)', () => {
    const a = w(d(2026, 1, 5));
    const b = w(d(2026, 1, 12));
    const sets = [
      s(a.id, 'bench', 60, 8),
      s(b.id, 'bench', 62.5, 8), // weight, e1rm, volume
      s(b.id, 'row', 50, 10), // first time for row: no record
    ];
    const list = computeBadges(input([a, b], sets), 3, NOW);
    expect(badge(list, 'rec10').progress).toEqual({ current: 3, target: 10 });
  });
});

describe('exerciseBests', () => {
  it('sorted by last trained, warm-up only exercises skipped', () => {
    const a = w(d(2026, 1, 5));
    const b = w(d(2026, 2, 5));
    const sets = [
      s(a.id, 'bench', 60, 8),
      s(a.id, 'squat', 100, 5),
      s(b.id, 'bench', 65, 6),
      s(b.id, 'curl', 10, 10, { warmup: true }),
    ];
    const out = exerciseBests(input([a, b], sets));
    expect(out.map((e) => e.exerciseId)).toEqual(['bench', 'squat']);
    expect(out[0]).toMatchObject({ lastAt: b.startedAt, records: { heaviest: { weight: 65, reps: 6 } } });
  });
});
