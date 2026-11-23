import { describe, expect, it } from 'vitest';
import { calculatePlates } from './plates';

const DEFAULT = [25, 20, 15, 10, 5, 2.5, 1.25];

describe('calculatePlates', () => {
  it('100 kg on a 20 kg bar', () => {
    const r = calculatePlates(100, 20, DEFAULT);
    expect(r.perSide).toEqual([25, 15]);
    expect(r.total).toBe(100);
    expect(r.exact).toBe(true);
  });

  it('60 kg', () => {
    expect(calculatePlates(60, 20, DEFAULT).perSide).toEqual([20]);
  });

  it('bar only', () => {
    const r = calculatePlates(20, 20, DEFAULT);
    expect(r.perSide).toEqual([]);
    expect(r.exact).toBe(true);
  });

  it('101 kg is not exact: offers 100 and 102.5', () => {
    const r = calculatePlates(101, 20, DEFAULT);
    expect(r.exact).toBe(false);
    expect(r.lower?.total).toBe(100);
    expect(r.higher?.total).toBe(102.5);
    expect(r.total).toBe(100);
  });

  it('below the bar', () => {
    const r = calculatePlates(15, 20, DEFAULT);
    expect(r.perSide).toEqual([]);
    expect(r.total).toBe(20);
    expect(r.exact).toBe(false);
  });

  it('limited plate set', () => {
    const r = calculatePlates(60, 20, [15, 10]);
    expect(r.perSide).toEqual([10, 10]);
    expect(r.exact).toBe(true);
  });

  it('no plates', () => {
    const r = calculatePlates(60, 20, []);
    expect(r.total).toBe(20);
    expect(r.exact).toBe(false);
  });

  it('small plate', () => {
    expect(calculatePlates(22.5, 20, DEFAULT).perSide).toEqual([1.25]);
  });

  it('fewest plates, heaviest first', () => {
    expect(calculatePlates(142.5, 20, DEFAULT).perSide).toEqual([25, 25, 10, 1.25]);
  });
});
