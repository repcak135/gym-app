import { describe, expect, it } from 'vitest';
import { DIFFICULTY_LEVELS, levelForRir, rirToRpeLabel, rpeToRir } from './difficulty';

describe('difficulty', () => {
  it('maps rir to RPE labels', () => {
    expect([0, 1, 2, 3, 4, 5].map(rirToRpeLabel)).toEqual(['RPE 10', 'RPE 9', 'RPE 8', 'RPE 7', 'RPE 5–6', 'RPE 1–4']);
  });
  it('clamps out-of-range rir', () => {
    expect(rirToRpeLabel(9)).toBe('RPE 1–4');
    expect(rirToRpeLabel(-1)).toBe('RPE 10');
    expect(levelForRir(2).label).toBe('Ciężko');
  });
  it('maps RPE back to rir for every level', () => {
    for (const l of DIFFICULTY_LEVELS) expect(rpeToRir(l.rpe)).toBe(l.rir);
    expect(rpeToRir('8')).toBe(2);
    expect(rpeToRir('5–6')).toBe(4);
    expect(rpeToRir('x')).toBeUndefined();
  });
  it('has six levels with unique rir', () => {
    expect(new Set(DIFFICULTY_LEVELS.map((l) => l.rir)).size).toBe(6);
  });
});
