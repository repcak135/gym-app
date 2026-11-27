// DOTS points (Tim Konertz, BVDK), as implemented by OpenPowerlifting (crates/coefficients/src/dots.rs).
// points = lifted × 500 / (a·bw⁴ + b·bw³ + c·bw² + d·bw + e); body weight clamped to the formula's range.

export type Sex = 'm' | 'f';

const COEF: Record<Sex, { a: number; b: number; c: number; d: number; e: number; min: number; max: number }> = {
  m: { a: -0.000001093, b: 0.0007391293, c: -0.1918759221, d: 24.0900756, e: -307.75076, min: 40, max: 210 },
  f: { a: -0.0000010706, b: 0.0005158568, c: -0.1126655495, d: 13.6175032, e: -57.96288, min: 40, max: 150 },
};

export function dotsCoefficient(bodyKg: number, sex: Sex): number {
  const { a, b, c, d, e, min, max } = COEF[sex];
  const x = Math.min(Math.max(bodyKg, min), max);
  return 500 / (a * x ** 4 + b * x ** 3 + c * x ** 2 + d * x + e);
}

/** 0 for missing or non-positive input. */
export function dots(liftKg: number, bodyKg: number, sex: Sex): number {
  if (!(liftKg > 0) || !(bodyKg > 0)) return 0;
  return liftKg * dotsCoefficient(bodyKg, sex);
}
