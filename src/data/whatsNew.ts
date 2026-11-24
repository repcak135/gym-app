import { db } from './db';
import { CHANGELOG, type ChangelogEntry } from './changelog';
import { updateSettings } from './settings';

/** Compares "1.2.3" versions numerically: <0 when a is older, 0 equal, >0 newer. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * What to do at launch:
 * - 'none': this version was already seen;
 * - 'store': brand-new user with no data — nothing to announce, just remember the version;
 * - 'show': someone who used an older version (or used the app before versions were tracked).
 */
export function decideWhatsNew(
  lastSeen: string | undefined,
  current: string,
  hasData: boolean,
): 'show' | 'store' | 'none' {
  if (lastSeen === current) return 'none';
  if (lastSeen === undefined && !hasData) return 'store';
  if (lastSeen !== undefined && compareVersions(lastSeen, current) > 0) return 'store'; // went back a version
  return 'show';
}

/** Entries newer than lastSeen (all of them when lastSeen is unknown), newest first. */
export function entriesSince(lastSeen: string | undefined, log: ChangelogEntry[] = CHANGELOG): ChangelogEntry[] {
  if (lastSeen === undefined) return log.slice(0, 1);
  const newer = log.filter((e) => compareVersions(e.version, lastSeen) > 0);
  return newer.length > 0 ? newer : log.slice(0, 1);
}

/** Has the user put anything of their own in the app? */
export async function hasUserData(): Promise<boolean> {
  const [workouts, plans, body, custom] = await Promise.all([
    db.workouts.count(),
    db.plans.count(),
    db.body.count(),
    db.exercises.filter((e) => !!e.custom).count(),
  ]);
  return workouts + plans + body + custom > 0;
}

export async function markVersionSeen(version: string): Promise<void> {
  await updateSettings({ lastSeenVersion: version });
}
