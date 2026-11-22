import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { DEFAULT_SETTINGS, getSettings, updateSettings } from './settings';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('settings', () => {
  it('domyślne ustawienia', async () => {
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('zmiana ustawień zostaje zapisana', async () => {
    await updateSettings({ barWeight: 15 });
    const settings = await getSettings();
    expect(settings.barWeight).toBe(15);
    expect(settings.plates).toEqual(DEFAULT_SETTINGS.plates);
  });
});
