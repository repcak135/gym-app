import { db } from '../data/db';

// Anonymous exercise list: built-in exercises only (custom names are free text), completed working
// sets (no warm-ups). The phone sends only what grew since its baseline, so nothing is counted twice.

const BASELINE_KEY = 'gym.cloudStatsBaseline';

export type Totals = Record<string, number>;

export async function exerciseTotals(): Promise<{ totals: Totals; names: Record<string, string> }> {
  const sets = await db.sets.filter((s) => !s.warmup && s.completedAt !== undefined).toArray();
  const totals: Totals = {};
  for (const s of sets) totals[s.exerciseId] = (totals[s.exerciseId] ?? 0) + 1;
  const ids = Object.keys(totals);
  const names: Record<string, string> = {};
  const exercises = await db.exercises.bulkGet(ids);
  ids.forEach((id, i) => {
    const e = exercises[i];
    if (!e || e.custom) delete totals[id];
    else names[id] = e.name;
  });
  return { totals, names };
}

export function readBaseline(): Totals {
  try {
    return JSON.parse(localStorage.getItem(BASELINE_KEY) ?? '{}') as Totals;
  } catch {
    return {};
  }
}

export function writeBaseline(t: Totals): void {
  try {
    localStorage.setItem(BASELINE_KEY, JSON.stringify(t));
  } catch {
    // private mode
  }
}

/** Only increases are sent; a deleted workout never makes the totals go down on the server. */
export function statsDelta(totals: Totals, names: Record<string, string>, baseline: Totals): { id: string; name: string; sets: number }[] {
  return Object.entries(totals)
    .map(([id, n]) => ({ id, name: names[id], sets: n - (baseline[id] ?? 0) }))
    .filter((x) => x.sets > 0 && x.name)
    .slice(0, 500);
}

/** After a restore or a login on a new phone: the history on the phone is already counted. */
export async function resetBaseline(): Promise<void> {
  writeBaseline((await exerciseTotals()).totals);
}
