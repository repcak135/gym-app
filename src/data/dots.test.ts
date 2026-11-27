import { describe, expect, it } from 'vitest';
import { dots, dotsCoefficient } from './dots';

const LB = 0.45359237;

describe('DOTS', () => {
  it('matches the published FitnessVolt example: 1150 lb total at 185 lb, male = 350.00', () => {
    expect(dots(1150 * LB, 185 * LB, 'm')).toBeCloseTo(350.0, 1);
  });

  it('uses the official male and female polynomials (OpenPowerlifting)', () => {
    // Hand-checked: at 100 kg the male denominator is 812.3269… → 0.61552
    expect(dotsCoefficient(100, 'm')).toBeCloseTo(500 / 812.32686, 5);
    const bw = 60;
    const f = -0.0000010706 * bw ** 4 + 0.0005158568 * bw ** 3 - 0.1126655495 * bw ** 2 + 13.6175032 * bw - 57.96288;
    expect(dotsCoefficient(bw, 'f')).toBeCloseTo(500 / f, 10);
    // Same lift, same body weight: women score higher.
    expect(dots(100, 60, 'f')).toBeGreaterThan(dots(100, 60, 'm'));
  });

  it('clamps body weight to 40–210 kg (men) and 40–150 kg (women)', () => {
    expect(dotsCoefficient(30, 'm')).toBe(dotsCoefficient(40, 'm'));
    expect(dotsCoefficient(250, 'm')).toBe(dotsCoefficient(210, 'm'));
    expect(dotsCoefficient(170, 'f')).toBe(dotsCoefficient(150, 'f'));
  });

  it('is 0 for a missing lift or body weight', () => {
    expect(dots(0, 80, 'm')).toBe(0);
    expect(dots(100, 0, 'm')).toBe(0);
    expect(dots(Number.NaN, 80, 'f')).toBe(0);
  });
});
