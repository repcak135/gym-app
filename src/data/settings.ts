import { db } from './db';
import type { AppSettings } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  key: 'app',
  barWeight: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  defaultWeightStep: 2.5,
  defaultRestSec: 120,
  defaultSets: 3,
  defaultWarmupSets: 0,
  defaultRepsMin: 8,
  defaultRepsMax: 12,
  restSound: true,
  restSoundPreset: 'bell',
  restTicks: true,
  restVibration: true,
  showRir: false,
  askDifficultyAfterSet: false,
  afterExerciseDone: 'next',
  effortTarget: 'close',
  weeklyGoal: 3,
};

export const WEIGHT_STEP_OPTIONS = [0.5, 1, 1.25, 2.5, 5];
export const BAR_WEIGHT_OPTIONS = [7.5, 10, 15, 20, 25];

export async function getSettings(): Promise<AppSettings> {
  const stored = await db.settings.get('app');
  // Settings saved by older versions lack newer fields: fill them with defaults.
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...stored, key: 'app' };
  return stored ? migrateSound(merged, stored) : merged;
}

/** Someone who muted the old sound toggle keeps silence (no preset stored yet). */
export function migrateSound<T extends { restSound?: boolean; restSoundPreset?: unknown }>(merged: AppSettings, stored: T): AppSettings {
  if (stored.restSoundPreset === undefined && stored.restSound === false) return { ...merged, restSoundPreset: 'silent' };
  return merged;
}

export async function updateSettings(patch: Partial<Omit<AppSettings, 'key'>>): Promise<AppSettings> {
  // One transaction, so quick successive changes cannot overwrite each other.
  return db.transaction('rw', db.settings, async () => {
    const current = await getSettings();
    const updated: AppSettings = { ...current, ...patch, key: 'app' };
    if (updated.defaultRepsMax < updated.defaultRepsMin) {
      // Keep the range valid whichever end was changed.
      if (patch.defaultRepsMin !== undefined) updated.defaultRepsMax = updated.defaultRepsMin;
      else updated.defaultRepsMin = updated.defaultRepsMax;
    }
    await db.settings.put(updated);
    return updated;
  });
}
