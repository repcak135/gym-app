import { describe, expect, it } from 'vitest';
import {
  activityLevel,
  clampGoal,
  muscleWeek,
  weekProgress,
  weekStartOf,
  yearActivity,
} from './motivation';
import type { StatsInput } from './stats';
import type { Workout, WorkoutSet } from './types';

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min).getTime();
const NOW = d(2026, 11, 18, 12); // Wed 18 Nov 2026; week starts Mon 16 Nov

let n = 0;
function w(at: number, extra: Partial<Workout> = {}): Workout {
  n++;
  return { id: `w${n}`, name: 'T', startedAt: at, endedAt: at + 3600_000, source: 'app', ...extra };
}
function s(workoutId: string, exerciseId: string, extra: Partial<WorkoutSet> = {}): WorkoutSet {
  n++;
  return {
    id: `s${n}`, workoutId, exerciseId, exerciseOrder: 0, setOrder: 0,
    weight: 50, reps: 8, warmup: false, completedAt: 1, ...extra,
  };
}
/** `count` finished workouts on Tuesday of the week `weeksAgo` weeks before NOW's week. */
function week(weeksAgo: number, count: number, source: Workout['source'] = 'import'): Workout[] {
  const tue = weekStartOf(NOW, -weeksAgo) + 86_400_000 + 18 * 3600_000;
  return Array.from({ length: count }, (_, i) => w(tue + i * 3600_000, { source }));
}

describe('weekStartOf', () => {
  it('Sunday 23:30 belongs to the previous Monday, Monday 00:10 to the new one', () => {
    expect(weekStartOf(d(2026, 11, 22, 23, 30))).toBe(d(2026, 11, 16));
    expect(weekStartOf(d(2026, 11, 23, 0, 10))).toBe(d(2026, 11, 23));
    expect(weekStartOf(NOW, -1)).toBe(d(2026, 11, 9));
  });
});

describe('clampGoal', () => {
  it('keeps 1–7, falls back to 3', () => {
    expect(clampGoal(1)).toBe(1);
    expect(clampGoal(7)).toBe(7);
    expect(clampGoal(0)).toBe(3);
    expect(clampGoal(8)).toBe(3);
    expect(clampGoal(2.5)).toBe(3);
    expect(clampGoal(undefined)).toBe(3);
  });
});

describe('weekProgress', () => {
  it('counts only finished workouts this week', () => {
    const live = w(NOW - 3600_000, { endedAt: undefined, source: 'app' });
    const r = weekProgress([...week(0, 2), live], 3, NOW);
    expect(r).toMatchObject({ done: 2, goal: 3, met: false });
  });
  it('3 met weeks + unmet current week = 3 (current week does not break)', () => {
    const ws = [...week(3, 3), ...week(2, 4), ...week(1, 3), ...week(0, 1)];
    expect(weekProgress(ws, 3, NOW).streak).toBe(3);
  });
  it('met current week adds 1', () => {
    const ws = [...week(2, 3), ...week(1, 3), ...week(0, 3, 'app')];
    expect(weekProgress(ws, 3, NOW)).toMatchObject({ met: true, streak: 3, done: 3 });
  });
  it('a gap week resets the streak', () => {
    const ws = [...week(4, 3), ...week(3, 3), ...week(2, 1), ...week(1, 3)];
    expect(weekProgress(ws, 3, NOW).streak).toBe(1);
  });
  it('goal 1 vs 3 on the same data', () => {
    const ws = [...week(3, 1), ...week(2, 2), ...week(1, 1)];
    expect(weekProgress(ws, 1, NOW).streak).toBe(3);
    expect(weekProgress(ws, 3, NOW).streak).toBe(0);
  });
});

describe('muscleWeek', () => {
  const muscles: StatsInput['muscles'] = new Map([
    ['bench', { primary: ['chest'], secondary: ['triceps', 'shoulders'] }],
    ['row', { primary: ['lats', 'middle back'], secondary: ['biceps', 'lats'] }],
    ['own', { primary: [], secondary: [] }],
  ]);
  it('primary 1, secondary 0.5, warm-ups ignored, bands', () => {
    const a = w(d(2026, 11, 17, 18));
    const old = w(d(2026, 11, 10, 18));
    const sets = [
      ...Array.from({ length: 10 }, () => s(a.id, 'bench')),
      s(a.id, 'bench', { warmup: true }),
      s(a.id, 'bench', { completedAt: undefined }),
      ...Array.from({ length: 3 }, () => s(a.id, 'row')),
      s(a.id, 'own'),
      s(old.id, 'bench'),
    ];
    const { rows, unmapped } = muscleWeek({ workouts: [a, old], sets, muscles }, weekStartOf(NOW));
    const by = Object.fromEntries(rows.map((r) => [r.group, r]));
    expect(rows).toHaveLength(10);
    expect(by.klatka).toMatchObject({ sets: 10, status: 'ok' });
    expect(by.triceps).toMatchObject({ sets: 5, status: 'low' });
    expect(by.barki.sets).toBe(5);
    // lats + middle back are both "plecy": counted once; lats as secondary is ignored (already primary)
    expect(by.plecy.sets).toBe(3);
    expect(by.biceps.sets).toBe(1.5);
    expect(unmapped).toBe(1);
  });
  it('band edges', async () => {
    const { muscleStatus } = await import('./motivation');
    expect(muscleStatus(9.5)).toBe('low');
    expect(muscleStatus(10)).toBe('ok');
    expect(muscleStatus(20)).toBe('ok');
    expect(muscleStatus(20.5)).toBe('high');
  });
});

describe('yearActivity', () => {
  it('groups two workouts on one day and counts working sets', () => {
    const a = w(d(2026, 3, 2, 8));
    const b = w(d(2026, 3, 2, 18));
    const c = w(d(2025, 12, 31, 18));
    const sets = [s(a.id, 'x'), s(a.id, 'x', { warmup: true }), s(b.id, 'x'), s(b.id, 'x'), s(c.id, 'x')];
    const m = yearActivity({ workouts: [b, a, c], sets, muscles: new Map() }, 2026);
    expect([...m.keys()]).toEqual(['2026-03-02']);
    expect(m.get('2026-03-02')).toEqual({ sets: 3, workoutIds: [a.id, b.id] });
  });
  it('counts time and distance sets (they store 0 reps)', () => {
    const a = w(d(2026, 3, 3, 8));
    const sets = [
      s(a.id, 'plank', { reps: 0, weight: 0, durationSec: 30 }),
      s(a.id, 'walk', { reps: 0, distanceM: 40 }),
      s(a.id, 'plank', { reps: 0, weight: 0 }),
    ];
    const m = yearActivity({ workouts: [a], sets, muscles: new Map() }, 2026);
    expect(m.get('2026-03-03')?.sets).toBe(2);
  });
  it('activityLevel thresholds', () => {
    expect([0, 11, 12, 19, 20, 27, 28, 60].map(activityLevel)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });
});
