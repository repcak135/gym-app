import { describe, expect, it } from 'vitest';
import { computeStats, daysSinceTrained, periodRange, weeklyCounts, type StatsInput } from './stats';
import type { Workout, WorkoutSet } from './types';

const d = (y: number, m: number, day: number, h = 0) => new Date(y, m - 1, day, h).getTime();
const NOW = d(2026, 11, 18, 12); // Wed

describe('periodRange', () => {
  it('week Mon–Sun', () => {
    const r = periodRange('week', 0, NOW);
    expect(r.start).toBe(d(2026, 11, 16));
    expect(r.end).toBe(d(2026, 11, 23));
    expect(r.label).toBe('16–22 lis 2026');
    expect(periodRange('week', -1, NOW).label).toBe('9–15 lis 2026');
  });
  it('week across year boundary', () => {
    const r = periodRange('week', 0, d(2026, 12, 31, 10));
    expect(r.label).toBe('28 gru – 3 sty 2027');
    expect(r.end).toBe(d(2027, 1, 4));
  });
  it('month, year, all', () => {
    expect(periodRange('month', 0, NOW).label).toBe('listopad 2026');
    expect(periodRange('month', -11, NOW).label).toBe('grudzień 2025');
    expect(periodRange('month', -11, NOW).start).toBe(d(2025, 12, 1));
    expect(periodRange('year', 0, NOW)).toMatchObject({ start: d(2026, 1, 1), end: d(2027, 1, 1), label: '2026' });
    const all = periodRange('all', 0, NOW, d(2026, 1, 5));
    expect(all).toMatchObject({ start: d(2026, 1, 5), end: d(2026, 11, 19), label: 'Wszystko' });
    expect(periodRange('all', 0, NOW).start).toBe(NOW);
  });
  it('week across DST is 7 calendar days', () => {
    const r = periodRange('week', 0, d(2026, 10, 27, 12));
    expect(r.start).toBe(d(2026, 10, 26));
    // week of 2026-10-25 (Sun, DST end in Europe) is Mon 19 – Sun 25
    const s = periodRange('week', 0, d(2026, 10, 25, 12));
    expect(new Date(s.start).getDate()).toBe(19);
    expect(new Date(s.end).getDate()).toBe(26);
    expect(new Date(s.end).getHours()).toBe(0);
  });
});

let n = 0;
function wk(startedAt: number, extra: Partial<Workout> = {}): Workout {
  return { id: `w${++n}`, name: 'T', startedAt, endedAt: startedAt + 3600_000, source: 'app', ...extra };
}
function set(w: Workout, exerciseId: string, extra: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: `s${++n}`, workoutId: w.id, exerciseId, exerciseOrder: 0, setOrder: 0,
    weight: 50, reps: 8, warmup: false, completedAt: w.startedAt, ...extra,
  };
}
const muscles: StatsInput['muscles'] = new Map([
  ['row', { primary: ['lats', 'middle back'], secondary: ['biceps'] }],
  ['bench', { primary: ['chest'], secondary: ['triceps', 'shoulders'] }],
  ['custom', { primary: [], secondary: [] }],
]);

describe('computeStats', () => {
  const w1 = wk(d(2026, 11, 16, 10), { endedAt: d(2026, 11, 16, 11) });
  const w2 = wk(d(2026, 11, 17, 10), { endedAt: d(2026, 11, 17, 10) + 1800_000 });
  const w3 = wk(d(2026, 11, 18, 9), { source: 'import', endedAt: undefined });
  const live = wk(d(2026, 11, 19, 9), { endedAt: undefined });
  const input: StatsInput = {
    workouts: [w1, w2, w3, live],
    sets: [
      set(w1, 'row'), set(w1, 'row'),
      set(w1, 'row', { warmup: true }),
      set(w1, 'row', { reps: 0 }),
      set(w2, 'bench'),
      set(w3, 'custom'),
      set(live, 'bench'),
    ],
    muscles,
  };
  const r = periodRange('week', 0, NOW);

  it('tiles', () => {
    const s = computeStats(input, r);
    expect(s).toMatchObject({
      workouts: 3, timedWorkouts: 2, untimedWorkouts: 1, totalSec: 5400, avgSec: 2700, workingSets: 4,
    });
  });
  it('groups', () => {
    const s = computeStats(input, r);
    expect(s.byGroup.primary.plecy).toBe(2); // lats + middle back count once per set
    expect(s.byGroup.primary.klatka).toBe(1);
    expect(s.byGroup.primary.biceps).toBe(0);
    expect(s.byGroup.secondary.biceps).toBe(2);
    expect(s.byGroup.secondary.plecy).toBe(0);
    expect(Object.keys(s.byGroup.primary)).toHaveLength(10);
    expect(s.unmappedSets).toBe(1);
  });
  it('byBody', () => {
    const s = computeStats(input, r);
    expect(s.byBody['upper-back']).toBe(2);
    expect(s.byBody.biceps).toBe(1); // 0.5 * 2 sets
    expect(s.byBody.chest).toBe(1);
    expect(s.byBody.triceps).toBe(0.5);
    expect(s.byBody['front-deltoids']).toBe(0.5);
  });
  it('primary wins over secondary for the same part', () => {
    const m = new Map([['x', { primary: ['biceps'], secondary: ['biceps'] }]]);
    const w = wk(d(2026, 11, 16, 10));
    const s = computeStats({ workouts: [w], sets: [set(w, 'x')], muscles: m }, r);
    expect(s.byBody.biceps).toBe(1);
  });
  it('empty period', () => {
    const s = computeStats(input, periodRange('week', -5, NOW));
    expect(s).toMatchObject({ workouts: 0, timedWorkouts: 0, untimedWorkouts: 0, totalSec: 0, workingSets: 0, unmappedSets: 0 });
    expect(s.avgSec).toBeUndefined();
    expect(s.byBody).toEqual({});
    expect(Object.values(s.byGroup.primary).every((v) => v === 0)).toBe(true);
    expect(computeStats({ workouts: [], sets: [], muscles: new Map() }, r).workouts).toBe(0);
  });
});

describe('time and distance sets', () => {
  it('count as working sets, warm-ups and unfinished ones do not', () => {
    const w = wk(d(2026, 11, 16, 10));
    const r = computeStats(
      {
        workouts: [w],
        sets: [
          set(w, 'bench', { reps: 0, weight: 0, durationSec: 60 }),
          set(w, 'bench', { reps: 0, weight: 20, distanceM: 40 }),
          set(w, 'bench', { reps: 0, weight: 0, durationSec: 60, warmup: true }),
          set(w, 'bench', { reps: 0, weight: 0, durationSec: 60, completedAt: undefined }),
          set(w, 'bench', { reps: 0, weight: 0 }),
        ],
        muscles,
      },
      periodRange('week', 0, NOW),
    );
    expect(r.workingSets).toBe(2);
  });
});

describe('daysSinceTrained', () => {
  it('whole calendar days, primary only, untrained absent', () => {
    const w = wk(d(2026, 11, 15, 23)); // 3 calendar days before NOW even though < 3*24h
    const old = wk(d(2026, 11, 1, 10));
    const live = wk(d(2026, 11, 17, 10), { endedAt: undefined });
    const input: StatsInput = {
      workouts: [w, old, live],
      sets: [set(w, 'bench'), set(old, 'bench'), set(old, 'row'), set(live, 'row'), set(w, 'bench', { warmup: true })],
      muscles,
    };
    const r = daysSinceTrained(input, NOW);
    expect(r.chest).toBe(3);
    expect(r['upper-back']).toBe(17);
    expect(r.triceps).toBeUndefined(); // secondary only
    expect(r.calves).toBeUndefined();
  });
});

describe('weeklyCounts', () => {
  const ws = [d(2026, 10, 28), d(2026, 11, 2), d(2026, 11, 3), d(2026, 11, 30)].map((t) => wk(t));
  const input: StatsInput = { workouts: ws, sets: [], muscles };
  it('month Nov 2026 → 6 weeks', () => {
    const c = weeklyCounts(input, periodRange('month', 0, NOW), 'month');
    expect(c).toHaveLength(6);
    expect(c[0].weekStart).toBe(d(2026, 10, 26));
    expect(c[5].weekStart).toBe(d(2026, 11, 30));
    expect(c.map((x) => x.count)).toEqual([0, 2, 0, 0, 0, 1]); // 28 Oct is outside the month
  });
  it('week → 12 weeks ending with the current one', () => {
    const c = weeklyCounts(input, periodRange('week', 0, NOW), 'week');
    expect(c).toHaveLength(12);
    expect(c[11].weekStart).toBe(d(2026, 11, 16));
    expect(c[0].weekStart).toBe(d(2026, 8, 31));
    expect(c.find((x) => x.weekStart === d(2026, 10, 26))?.count).toBe(1);
  });
});
