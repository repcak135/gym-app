import { formatKg } from './progression';

/** How close to failure the owner wants to train (AppSettings.effortTarget). */
export type EffortTarget = 'failure' | 'close' | 'reserve';
export type TargetReason = 'none' | 'reps' | 'easy' | 'top' | 'hard' | 'below' | 'copy';
export interface SetTarget {
  weight: number;
  reps: number;
  reason: TargetReason;
  text: string;
}

export const EFFORT_OPTIONS: { value: EffortTarget; label: string; hint: string }[] = [
  { value: 'failure', label: 'Do upadku', hint: 'RPE 10 — do ostatniego powtórzenia' },
  { value: 'close', label: 'Blisko upadku — 1–2 w zapasie', hint: 'RPE 8–9, polecane' },
  { value: 'reserve', label: 'Z zapasem — 2–3 w zapasie', hint: 'RPE 7–8' },
];

/** Reps in reserve (low, high) that count as "just right" for each target. */
const BANDS: Record<EffortTarget, [number, number]> = {
  failure: [0, 0],
  close: [1, 2],
  reserve: [2, 3],
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function effortOf(rir: number | undefined, effort: EffortTarget): 'easy' | 'ok' | 'hard' | 'unknown' {
  if (rir === undefined) return 'unknown';
  const [low, high] = BANDS[effort];
  if (rir >= high + 2) return 'easy';
  if (rir < low) return 'hard';
  return 'ok';
}

function targetFor(
  r: { weight: number; reps: number; rir?: number },
  o: { repsMin: number; repsMax: number; step: number; effort: EffortTarget },
): SetTarget {
  const { repsMin, repsMax, step } = o;
  const feel = effortOf(r.rir, o.effort);
  const top = (reason: TargetReason, text: string): SetTarget => ({
    weight: round2(r.weight + step),
    reps: repsMin,
    reason,
    text,
  });

  if (feel === 'hard' && r.reps >= repsMin) {
    return { weight: r.weight, reps: r.reps, reason: 'hard', text: 'Było ciężej niż chcesz — powtórz to samo' };
  }
  if (r.reps < repsMin) {
    return { weight: r.weight, reps: r.reps + 1, reason: 'below', text: `Ostatnio ${r.reps} — poniżej zakresu, dorzuć 1` };
  }
  if (r.reps >= repsMax) {
    if (r.weight > 0) {
      return top(
        'top',
        `Ostatnio ${r.reps}, czyli górna granica — weź ${formatKg(step)} kg więcej i zacznij od ${repsMin}`,
      );
    }
    return { weight: 0, reps: r.reps + 1, reason: 'reps', text: `Ostatnio ${r.reps} — dorzuć 1` };
  }
  if (feel === 'easy') {
    if (r.reps + 2 > repsMax && r.weight > 0) {
      return top(
        'easy',
        `Ostatnio ${r.reps} i było lekko — weź ${formatKg(step)} kg więcej i zacznij od ${repsMin}`,
      );
    }
    return { weight: r.weight, reps: r.reps + 2, reason: 'easy', text: `Ostatnio ${r.reps} i było lekko — dorzuć 2` };
  }
  return {
    weight: r.weight,
    reps: Math.min(repsMax, r.reps + 1),
    reason: 'reps',
    text: `Ostatnio ${r.reps} powtórzeń — dorzuć 1`,
  };
}

/** One target per planned working set, each based on the same-index set last time. */
export function setTargets(opts: {
  lastWorking: { weight: number; reps: number; rir?: number }[];
  count: number;
  repsMin: number;
  repsMax: number;
  step: number;
  effort: EffortTarget;
}): SetTarget[] {
  const { lastWorking, count } = opts;
  if (lastWorking.length === 0) return [];
  const out: SetTarget[] = [];
  for (let i = 0; i < count; i++) {
    if (i < lastWorking.length) out.push(targetFor(lastWorking[i], opts));
    else {
      const prev = out[i - 1] ?? targetFor(lastWorking[lastWorking.length - 1], opts);
      out.push({ weight: prev.weight, reps: prev.reps, reason: 'copy', text: 'Jak poprzednia seria' });
    }
  }
  return out;
}

/** Sessions newest first (working sets only): true when the 3 newest brought no progress over the one before. */
export function isStagnating(sessions: { weight: number; reps: number }[][]): boolean {
  if (sessions.length < 4) return false;
  for (let k = 0; k < 3; k++) {
    const cur = sessions[k];
    const prev = sessions[k + 1];
    for (let i = 0; i < cur.length; i++) {
      const p = prev[i];
      if (!p) continue; // no earlier set to compare with: no progress
      if (cur[i].weight > p.weight || (cur[i].weight === p.weight && cur[i].reps > p.reps)) return false;
    }
  }
  return true;
}

/** About 10% lighter, rounded down to a multiple of the step. */
export function deloadWeight(weight: number, step: number): number {
  if (weight <= 0 || step <= 0) return Math.max(0, weight);
  const n = Math.floor(round2((weight * 0.9) / step) + 1e-9);
  return Math.max(0, round2(n * step));
}
