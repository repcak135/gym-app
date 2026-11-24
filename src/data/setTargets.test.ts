import { describe, it, expect } from 'vitest';
import { setTargets, effortOf, isStagnating, deloadWeight, EFFORT_OPTIONS } from './setTargets';

const base = { repsMin: 8, repsMax: 12, step: 2.5, effort: 'close' as const };

describe('setTargets', () => {
  it('adds one rep when below the top of the range', () => {
    const [t] = setTargets({ ...base, lastWorking: [{ weight: 30, reps: 9 }], count: 1 });
    expect(t).toEqual({ weight: 30, reps: 10, reason: 'reps', text: 'Ostatnio 9 powtórzeń — dorzuć 1' });
  });

  it('targets each set independently', () => {
    const t = setTargets({
      ...base,
      lastWorking: [
        { weight: 32.5, reps: 12 },
        { weight: 32.5, reps: 10 },
        { weight: 32.5, reps: 8 },
      ],
      count: 3,
    });
    expect(t.map((x) => [x.weight, x.reps, x.reason])).toEqual([
      [35, 8, 'top'],
      [32.5, 11, 'reps'],
      [32.5, 9, 'reps'],
    ]);
    expect(t[0].text).toBe('Ostatnio 12, czyli górna granica — weź 2,5 kg więcej i zacznij od 8');
  });

  it('repeats a set that felt too hard, unless the effort target is failure', () => {
    const last = [{ weight: 30, reps: 10, rir: 0 }];
    const [hard] = setTargets({ ...base, lastWorking: last, count: 1 });
    expect(hard).toMatchObject({ weight: 30, reps: 10, reason: 'hard', text: 'Było ciężej niż chcesz — powtórz to samo' });
    const [fail] = setTargets({ ...base, effort: 'failure', lastWorking: last, count: 1 });
    expect(fail).toMatchObject({ weight: 30, reps: 11, reason: 'reps' });
  });

  it('adds 2 reps after an easy set, or moves up when that passes the range', () => {
    const [a] = setTargets({ ...base, lastWorking: [{ weight: 30, reps: 10, rir: 5 }], count: 1 });
    expect(a).toMatchObject({ weight: 30, reps: 12, reason: 'easy', text: 'Ostatnio 10 i było lekko — dorzuć 2' });
    const [b] = setTargets({ ...base, lastWorking: [{ weight: 30, reps: 11, rir: 5 }], count: 1 });
    expect(b).toMatchObject({ weight: 32.5, reps: 8, reason: 'easy' });
    expect(b.text).toBe('Ostatnio 11 i było lekko — weź 2,5 kg więcej i zacznij od 8');
  });

  it('never adds weight from 0 (bodyweight): +1 rep instead', () => {
    const [t] = setTargets({ ...base, lastWorking: [{ weight: 0, reps: 12 }], count: 1 });
    expect(t).toMatchObject({ weight: 0, reps: 13, reason: 'reps' });
  });

  it('keeps the weight and adds 1 rep below the range', () => {
    const [t] = setTargets({ ...base, lastWorking: [{ weight: 30, reps: 5 }], count: 1 });
    expect(t).toMatchObject({ weight: 30, reps: 6, reason: 'below', text: 'Ostatnio 5 — poniżej zakresu, dorzuć 1' });
  });

  it('copies the last set target for extra sets', () => {
    const t = setTargets({
      ...base,
      lastWorking: [
        { weight: 30, reps: 10 },
        { weight: 30, reps: 9 },
        { weight: 30, reps: 8 },
      ],
      count: 4,
    });
    expect(t).toHaveLength(4);
    expect(t[3]).toEqual({ weight: t[2].weight, reps: t[2].reps, reason: 'copy', text: 'Jak poprzednia seria' });
  });

  it('returns [] without history', () => {
    expect(setTargets({ ...base, lastWorking: [], count: 3 })).toEqual([]);
  });
});

describe('effortOf', () => {
  it('is unknown without RIR', () => {
    expect(effortOf(undefined, 'close')).toBe('unknown');
  });
  it('classifies by band', () => {
    expect(effortOf(0, 'close')).toBe('hard');
    expect(effortOf(1, 'close')).toBe('ok');
    expect(effortOf(4, 'close')).toBe('easy');
    expect(effortOf(0, 'failure')).toBe('ok');
    expect(effortOf(2, 'failure')).toBe('easy');
  });
});

describe('isStagnating', () => {
  const s = [{ weight: 30, reps: 10 }, { weight: 30, reps: 9 }];
  it('is true after 4 identical sessions', () => {
    expect(isStagnating([s, s, s, s])).toBe(true);
  });
  it('needs at least 4 sessions', () => {
    expect(isStagnating([s, s, s])).toBe(false);
  });
  it('is false when the newest session progressed', () => {
    expect(isStagnating([[{ weight: 30, reps: 11 }, s[1]], s, s, s])).toBe(false);
  });
});

describe('deloadWeight', () => {
  it('lowers ~10% rounded down to the step', () => {
    expect(deloadWeight(62.5, 2.5)).toBe(55);
    expect(deloadWeight(20, 2.5)).toBe(17.5);
    expect(deloadWeight(0, 2.5)).toBe(0);
  });
});

describe('EFFORT_OPTIONS', () => {
  it('has the three targets', () => {
    expect(EFFORT_OPTIONS.map((o) => o.value)).toEqual(['failure', 'close', 'reserve']);
  });
});
