import { calculatePlates } from './plates';

export interface WarmupSet {
  weight: number;
  reps: number;
}

const STEPS: { pct: number; reps: number }[] = [
  { pct: 0.4, reps: 8 },
  { pct: 0.6, reps: 5 },
  { pct: 0.8, reps: 3 },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Heaviest weight not above `target` that bar + pairs of the available plates can make. */
function loadableBelow(target: number, bar: number, plates: number[]): number {
  const r = calculatePlates(target, bar, plates);
  if (r.exact) return r.total;
  return r.lower?.total ?? bar;
}

/**
 * Warm-up ramp towards a working weight: the empty bar (if any), then 40/60/80% of it.
 * Weights are rounded down to something loadable; steps that would not be lighter than
 * the previous one, or not lighter than the working weight, are dropped.
 */
export function warmupRamp(opts: { work: number; bar: number | null; plates: number[]; step: number }): WarmupSet[] {
  const { work, bar, plates, step } = opts;
  if (!(work > 0)) return [];
  const raw: WarmupSet[] = [];
  if (bar !== null) {
    raw.push({ weight: bar, reps: 10 });
    for (const s of STEPS) raw.push({ weight: loadableBelow(work * s.pct, bar, plates), reps: s.reps });
  } else {
    for (const s of STEPS) {
      const units = Math.floor(round2((work * s.pct) / step) + 1e-9);
      raw.push({ weight: round2(units * step), reps: s.reps });
    }
  }
  const out: WarmupSet[] = [];
  let prev = 0;
  for (const s of raw) {
    if (s.weight <= 0 || s.weight <= prev || s.weight >= work) continue;
    out.push(s);
    prev = s.weight;
  }
  return out;
}
