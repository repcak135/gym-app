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

  it('stare ustawienia bez nowych pól dostają wartości domyślne', async () => {
    await db.settings.put({ key: 'app', barWeight: 15, plates: [20, 10], defaultWeightStep: 1.25, activePlanId: 'p1' } as never);
    const s = await getSettings();
    expect(s.barWeight).toBe(15);
    expect(s.defaultWeightStep).toBe(1.25);
    expect(s.activePlanId).toBe('p1');
    expect(s.defaultRestSec).toBe(120);
    expect([s.defaultSets, s.defaultWarmupSets, s.defaultRepsMin, s.defaultRepsMax]).toEqual([3, 0, 8, 12]);
  });

  it('zakres powtórzeń zostaje poprawny', async () => {
    let s = await updateSettings({ defaultRepsMin: 15 });
    expect([s.defaultRepsMin, s.defaultRepsMax]).toEqual([15, 15]);
    s = await updateSettings({ defaultRepsMax: 10 });
    expect([s.defaultRepsMin, s.defaultRepsMax]).toEqual([10, 10]);
  });
});
