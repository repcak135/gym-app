import { db } from './db';
import type { AppSettings } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  key: 'app',
  barWeight: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  defaultWeightStep: 2.5,
};

export async function getSettings(): Promise<AppSettings> {
  const stored = await db.settings.get('app');
  return stored ?? { ...DEFAULT_SETTINGS };
}

export async function updateSettings(patch: Partial<Omit<AppSettings, 'key'>>): Promise<AppSettings> {
  const current = await getSettings();
  const updated: AppSettings = { ...current, ...patch, key: 'app' };
  await db.settings.put(updated);
  return updated;
}
