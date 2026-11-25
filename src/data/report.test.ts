import { describe, expect, it } from 'vitest';
import { buildReport, reportFileName, reportRange, type ReportInput } from './report';
import type { BodyEntry, Workout, WorkoutSet } from './types';

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min).getTime();
const NOW = d(2026, 11, 18, 12); // Wed

describe('reportRange', () => {
  it('week is the Mon–Sun week containing now', () => {
    const r = reportRange('week', NOW);
    expect(r).toEqual({ start: d(2026, 11, 16), end: d(2026, 11, 23), from: '2026-11-16', to: '2026-11-22' });
  });
  it('month and year', () => {
    expect(reportRange('month', NOW)).toMatchObject({ from: '2026-11-01', to: '2026-11-30', start: d(2026, 11, 1) });
    expect(reportRange('month', NOW).end).toBe(d(2026, 12, 1));
    expect(reportRange('year', NOW)).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
  });
  it('all runs from the first workout day to today', () => {
    const r = reportRange('all', NOW, d(2026, 1, 5, 17, 30));
    expect(r).toEqual({ start: d(2026, 1, 5), end: d(2026, 11, 19), from: '2026-01-05', to: '2026-11-18' });
    const none = reportRange('all', NOW);
    expect(none.from).toBe('2026-11-18');
    expect(none.to).toBe('2026-11-18');
    expect(none.start).toBe(d(2026, 11, 18));
  });
  it('custom range has inclusive edges', () => {
    const r = reportRange('custom', NOW, undefined, { from: '2026-11-01', to: '2026-11-30' });
    expect(r.start).toBe(d(2026, 11, 1));
    expect(r.end).toBe(d(2026, 12, 1));
    // 00:00 on from is in, 23:59 on to is in, 00:00 the day after is out
    expect(d(2026, 11, 1, 0, 0) >= r.start && d(2026, 11, 1, 0, 0) < r.end).toBe(true);
    expect(d(2026, 11, 30, 23, 59) < r.end).toBe(true);
    expect(d(2026, 12, 1, 0, 0) < r.end).toBe(false);
    expect(d(2026, 10, 31, 23, 59) >= r.start).toBe(false);
  });
  it('custom single day', () => {
    const r = reportRange('custom', NOW, undefined, { from: '2026-11-05', to: '2026-11-05' });
    expect(r.end - r.start).toBe(d(2026, 11, 6) - d(2026, 11, 5));
  });
  it('throws when from is after to', () => {
    expect(() => reportRange('custom', NOW, undefined, { from: '2026-11-10', to: '2026-11-01' })).toThrow(
      'Data początkowa jest po końcowej',
    );
  });
  it('throws on empty dates', () => {
    expect(() => reportRange('custom', NOW, undefined, { from: '', to: '2026-11-01' })).toThrow('Wybierz obie daty');
    expect(() => reportRange('custom', NOW, undefined, { from: '2026-11-01', to: '' })).toThrow('Wybierz obie daty');
    expect(() => reportRange('custom', NOW)).toThrow('Wybierz obie daty');
  });
});

describe('reportFileName', () => {
  it('uses first and last day', () => {
    expect(reportFileName({ from: '2026-11-01', to: '2026-11-30' })).toBe('raport-2026-11-01_2026-11-30.xlsx');
  });
});

let n = 0;
function wk(startedAt: number, extra: Partial<Workout> = {}): Workout {
  return { id: `w${++n}`, name: 'Trening', startedAt, endedAt: startedAt + 3600_000, source: 'app', ...extra };
}
function st(w: Workout, exerciseId: string, extra: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: `s${++n}`, workoutId: w.id, exerciseId, exerciseOrder: 0, setOrder: 0,
    weight: 50, reps: 5, warmup: false, completedAt: w.startedAt, ...extra,
  };
}

const exercises = new Map([
  ['bench', { name: 'Wyciskanie' }],
  ['squat', { name: 'Przysiad' }],
]);

function fixture(): ReportInput {
  const w0 = wk(d(2026, 10, 20, 10)); // before range
  const w1 = wk(d(2026, 11, 3, 10), { name: 'Push' });
  const w2 = wk(d(2026, 11, 10, 18), { name: 'Import', source: 'import', endedAt: undefined });
  const body: BodyEntry[] = [
    { id: 'b0', date: '2026-10-30', weightKg: 99, measurements: {} },
    { id: 'b1', date: '2026-11-02', weightKg: 80, measurements: {} },
    { id: 'b2', date: '2026-11-20', weightKg: 78.5, measurements: { waist: 90 } },
    { id: 'b3', date: '2026-12-01', weightKg: 70, measurements: {} },
  ];
  const sets: WorkoutSet[] = [
    st(w0, 'bench', { weight: 60 }),
    // w1: out of order in the array on purpose
    st(w1, 'bench', { weight: 62.5, setOrder: 2, rir: 2 }),
    st(w1, 'squat', { weight: 100, exerciseOrder: 1 }),
    st(w1, 'bench', { weight: 62.5, setOrder: 1 }),
    st(w1, 'bench', { weight: 40, reps: 10, warmup: true, setOrder: 0 }),
    st(w1, 'bench', { weight: 70, setOrder: 3, completedAt: undefined }),
    st(w2, 'bench', { weight: 65 }),
  ];
  return { workouts: [w2, w0, w1], sets, exercises, body };
}

const RANGE = { start: d(2026, 11, 1), end: d(2026, 12, 1), from: '2026-11-01', to: '2026-11-30' };

describe('buildReport', () => {
  const r = buildReport(fixture(), RANGE);

  it('counts workouts, timed workouts and time', () => {
    expect(r.from).toBe('2026-11-01');
    expect(r.to).toBe('2026-11-30');
    expect(r.summary.workouts).toBe(2);
    expect(r.summary.timedWorkouts).toBe(1); // the import has no duration
    expect(r.summary.totalSec).toBe(3600);
  });

  it('counts working sets and volume (no warm-ups, no unfinished sets)', () => {
    expect(r.summary.workingSets).toBe(4);
    expect(r.summary.volume).toBe(1450); // 625 + 500 + 325
    expect(r.workouts).toHaveLength(2);
    expect(r.workouts[0]).toMatchObject({
      date: d(2026, 11, 3, 10), name: 'Push', durationMin: 60,
      exercises: 'Wyciskanie, Przysiad', workingSets: 3, volume: 1125,
    });
    expect(r.workouts[1].durationMin).toBeUndefined();
    expect(r.workouts[1]).toMatchObject({ name: 'Import', workingSets: 1, volume: 325 });
  });

  it('lists only completed sets, numbered per exercise in order, with RIR and warm-up', () => {
    expect(r.sets).toHaveLength(5); // 4 in w1 (warm-up + 2 bench + squat) + 1 in w2
    const bench = r.sets.filter((s) => s.workout === 'Push' && s.exercise === 'Wyciskanie');
    expect(bench.map((s) => s.set)).toEqual([1, 2, 3]);
    expect(bench.map((s) => s.warmup)).toEqual([true, false, false]);
    expect(bench.map((s) => s.weight)).toEqual([40, 62.5, 62.5]);
    expect(bench.map((s) => s.rir)).toEqual([undefined, undefined, 2]);
    const squat = r.sets.find((s) => s.exercise === 'Przysiad')!;
    expect(squat.set).toBe(1);
    expect(r.sets.some((s) => s.weight === 70)).toBe(false);
  });

  it('records: beaten exercise yields records, first-time exercise none', () => {
    const bench = r.summary.records.filter((x) => x.exercise === 'Wyciskanie');
    expect(bench).toEqual([
      { date: d(2026, 11, 10, 18), exercise: 'Wyciskanie', kind: 'Ciężar', value: 65, previous: 60 },
      { date: d(2026, 11, 10, 18), exercise: 'Wyciskanie', kind: 'Szacowany 1RM', value: 75.8, previous: 70 },
    ]);
    expect(r.summary.records.some((x) => x.exercise === 'Przysiad')).toBe(false);
  });

  it('progress compares first and last workout in range, sorted by name', () => {
    expect(r.progress.map((p) => p.exercise)).toEqual(['Przysiad', 'Wyciskanie']);
    expect(r.progress[1]).toEqual({
      exercise: 'Wyciskanie', workingSets: 3,
      startWeight: 62.5, endWeight: 65, startE1rm: 72.9, endE1rm: 75.8,
    });
    expect(r.progress[0]).toMatchObject({ startWeight: 100, endWeight: 100, startE1rm: 116.7, endE1rm: 116.7 });
  });

  it('body: only entries in range, change needs two entries', () => {
    expect(r.body.map((b) => b.date)).toEqual(['2026-11-02', '2026-11-20']);
    const weight = r.summary.body.find((b) => b.label === 'Waga')!;
    expect(weight).toEqual({ label: 'Waga', unit: 'kg', start: 80, end: 78.5, change: -1.5 });
    const waist = r.summary.body.find((b) => b.label === 'Talia')!;
    expect(waist).toEqual({ label: 'Talia', unit: 'cm', start: 90, end: 90 });
    expect(r.summary.body).toHaveLength(2);
  });

  it('empty range gives zero counts and empty arrays', () => {
    const e = buildReport(fixture(), {
      start: d(2025, 1, 1), end: d(2025, 2, 1), from: '2025-01-01', to: '2025-01-31',
    });
    expect(e.summary).toEqual({
      workouts: 0, timedWorkouts: 0, totalSec: 0, workingSets: 0, volume: 0, records: [], body: [],
    });
    expect(e.workouts).toEqual([]);
    expect(e.sets).toEqual([]);
    expect(e.progress).toEqual([]);
    expect(e.body).toEqual([]);
  });

  it('time and distance sets count as sets and carry duration / distance', () => {
    const w = wk(d(2026, 11, 5, 10));
    const sets = [
      st(w, 'bench', { weight: 60 }),
      st(w, 'plank', { weight: 0, reps: 0, durationSec: 75, exerciseOrder: 1 }),
      st(w, 'walk', { weight: 25, reps: 0, distanceM: 40, exerciseOrder: 2 }),
    ];
    const rep = buildReport({ workouts: [w], sets, exercises, body: [] }, RANGE);
    expect(rep.summary.workingSets).toBe(3);
    expect(rep.summary.volume).toBe(300);
    const plank = rep.sets.find((x) => x.durationSec === 75)!;
    expect(plank.distanceM).toBeUndefined();
    expect(rep.sets.find((x) => x.distanceM === 40)!.durationSec).toBeUndefined();
    expect(rep.sets[0].durationSec).toBeUndefined();
  });

  it('ignores unfinished workouts', () => {
    const w = wk(d(2026, 11, 5, 10), { endedAt: undefined });
    const input: ReportInput = { workouts: [w], sets: [st(w, 'bench')], exercises, body: [] };
    expect(buildReport(input, RANGE).summary.workouts).toBe(0);
  });
});
