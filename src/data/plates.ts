export interface PlateOption {
  /** Plates for one side of the bar, heaviest first. */
  perSide: number[];
  /** Total weight with the bar. */
  total: number;
}

export interface PlateResult extends PlateOption {
  exact: boolean;
  lower?: PlateOption;
  higher?: PlateOption;
}

const toUnits = (kg: number) => Math.round(kg * 100);
const fromUnits = (u: number) => u / 100;

/**
 * Fewest plates per side (unlimited pairs of each size) for the target weight.
 * Works in integer hundredths of kg to avoid float error. When the target
 * cannot be made exactly, offers the nearest lower and higher weights.
 */
export function calculatePlates(target: number, bar: number, plates: number[]): PlateResult {
  const barU = toUnits(bar);
  const diff = toUnits(target) - barU;
  const sizes = [...new Set(plates.filter((p) => p > 0 && Number.isFinite(p)).map(toUnits))]
    .filter((u) => u > 0)
    .sort((a, b) => b - a);

  const option = (perSideU: number[]): PlateOption => ({
    perSide: perSideU.map(fromUnits),
    total: fromUnits(barU + 2 * perSideU.reduce((a, b) => a + b, 0)),
  });
  const barOnly = option([]);

  if (diff <= 0) {
    return { ...barOnly, exact: diff === 0, ...(diff < 0 ? { higher: barOnly } : {}) };
  }
  if (sizes.length === 0) return { ...barOnly, exact: false, lower: barOnly };

  const half = Math.ceil(diff / 2);
  const limit = half + sizes[0];
  const dp = new Array<number>(limit + 1).fill(Infinity);
  dp[0] = 0;
  for (let s = 1; s <= limit; s++) {
    for (const p of sizes) {
      if (p <= s && dp[s - p] + 1 < dp[s]) dp[s] = dp[s - p] + 1;
    }
  }

  const build = (s: number): PlateOption => {
    const out: number[] = [];
    let rem = s;
    while (rem > 0) {
      const p = sizes.find((x) => x <= rem && dp[rem - x] === dp[rem] - 1)!;
      out.push(p);
      rem -= p;
    }
    return option(out);
  };

  if (diff % 2 === 0 && Number.isFinite(dp[diff / 2])) {
    return { ...build(diff / 2), exact: true };
  }

  let lowS = -1;
  for (let s = Math.floor(diff / 2); s >= 0; s--) {
    if (Number.isFinite(dp[s])) { lowS = s; break; }
  }
  let highS = -1;
  for (let s = half; s <= limit; s++) {
    if (Number.isFinite(dp[s]) && 2 * s >= diff) { highS = s; break; }
  }

  const lower = lowS >= 0 ? build(lowS) : undefined;
  const higher = highS >= 0 ? build(highS) : undefined;
  const useHigher = higher !== undefined && (lowS < 0 || 2 * highS - diff < diff - 2 * lowS);
  const chosen = (useHigher ? higher : lower) ?? barOnly;
  return { ...chosen, exact: false, ...(lower ? { lower } : {}), ...(higher ? { higher } : {}) };
}
