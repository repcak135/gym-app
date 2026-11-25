import { describe, it, expect } from 'vitest';
import { warmupRamp } from './warmup';

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

describe('warmupRamp', () => {
  it('builds a ramp from the bar to 80%', () => {
    expect(warmupRamp({ work: 100, bar: 20, plates: PLATES, step: 2.5 })).toEqual([
      { weight: 20, reps: 10 },
      { weight: 40, reps: 8 },
      { weight: 60, reps: 5 },
      { weight: 80, reps: 3 },
    ]);
  });

  it('drops steps that are not heavier than the previous one', () => {
    // 12 and 18 fall back to the bar; with 2,5 kg as the smallest plate 24 also does
    expect(warmupRamp({ work: 30, bar: 20, plates: [25, 20, 15, 10, 5, 2.5], step: 2.5 })).toEqual([{ weight: 20, reps: 10 }]);
    // with 1,25 kg plates 22,5 kg is loadable and stays
    expect(warmupRamp({ work: 30, bar: 20, plates: PLATES, step: 2.5 })).toEqual([
      { weight: 20, reps: 10 },
      { weight: 22.5, reps: 3 },
    ]);
  });

  it('gives nothing when the work weight is not above the bar', () => {
    expect(warmupRamp({ work: 20, bar: 20, plates: PLATES, step: 2.5 })).toEqual([]);
    expect(warmupRamp({ work: 15, bar: 20, plates: PLATES, step: 2.5 })).toEqual([]);
  });

  it('works without a bar, rounding down to the step', () => {
    expect(warmupRamp({ work: 20, bar: null, plates: [], step: 2 })).toEqual([
      { weight: 8, reps: 8 },
      { weight: 12, reps: 5 },
      { weight: 16, reps: 3 },
    ]);
  });

  it('returns [] for zero or negative weight', () => {
    expect(warmupRamp({ work: 0, bar: 20, plates: PLATES, step: 2.5 })).toEqual([]);
    expect(warmupRamp({ work: 0, bar: null, plates: [], step: 2 })).toEqual([]);
  });
});
