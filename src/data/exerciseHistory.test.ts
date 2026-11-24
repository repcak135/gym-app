import { describe, expect, it } from 'vitest';
import { formatSessionDate, historySessions } from './exerciseHistory';
import type { Workout, WorkoutSet } from './types';

const d = (y: number, m: number, day: number, h = 18) => new Date(y, m - 1, day, h).getTime();

describe('formatSessionDate', () => {
  it('weekday + date, year only when not the current one', () => {
    const now = d(2026, 11, 24);
    expect(formatSessionDate(d(2026, 11, 6), now)).toBe('piątek, 6 listopada');
    expect(formatSessionDate(d(2026, 3, 1), now)).toBe('niedziela, 1 marca');
    expect(formatSessionDate(d(2025, 12, 31), now)).toBe('środa, 31 grudnia 2025');
  });
});

let n = 0;
const w = (at: number): Workout => ({ id: `w${++n}`, name: 'Upper 1', startedAt: at, endedAt: at + 1, source: 'app' });
const s = (workoutId: string, weight: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: `s${++n}`, workoutId, exerciseId: 'bench', exerciseOrder: 0, setOrder: n, weight, reps, warmup: false, completedAt: 1, ...extra,
});

describe('historySessions', () => {
  it('numbers rows, keeps warm-ups and RPE, marks record sets (never in the first session)', () => {
    const a = w(d(2026, 11, 2));
    const b = w(d(2026, 11, 6));
    const aSets = [s(a.id, 20, 10, { warmup: true }), s(a.id, 40, 8), s(a.id, 40, 7)];
    const bSets = [s(b.id, 20, 10, { warmup: true, rir: 4 }), s(b.id, 42.5, 6, { rir: 2 }), s(b.id, 40, 9)];
    const out = historySessions([
      { workout: b, sets: bSets },
      { workout: a, sets: aSets },
    ]);
    expect(out.map((x) => x.workout.id)).toEqual([b.id, a.id]);
    expect(out[1].rows.every((r) => !r.record)).toBe(true);
    const rows = out[0].rows;
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3]);
    expect(rows[0]).toMatchObject({ warmup: true, rpe: 'RPE 5–6', record: false });
    expect(rows[1]).toMatchObject({ weight: 42.5, rpe: 'RPE 8', record: true }); // heaviest
    expect(rows[2]).toMatchObject({ weight: 40, reps: 9, record: true }); // more reps at 40 kg
  });
});
