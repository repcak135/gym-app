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
    expect(s.afterExerciseDone).toBe('next');
  });

  it('dźwięk końca przerwy: domyślnie dzwonek i tyknięcia', async () => {
    const s = await getSettings();
    expect([s.restSoundPreset, s.restTicks]).toEqual(['bell', true]);
  });

  it('stare restSound:false bez presetu daje ciszę', async () => {
    await db.settings.put({ key: 'app', restSound: false } as never);
    expect((await getSettings()).restSoundPreset).toBe('silent');
  });

  it('zapisany preset zostaje, także przy restSound:false', async () => {
    await db.settings.put({ key: 'app', restSound: false, restSoundPreset: 'gong' } as never);
    expect((await getSettings()).restSoundPreset).toBe('gong');
    await updateSettings({ restSoundPreset: 'beeps' });
    expect((await getSettings()).restSoundPreset).toBe('beeps');
  });

  it('askDifficultyAfterSet: domyślnie wyłączone, zmiana zostaje zapisana', async () => {
    expect((await getSettings()).askDifficultyAfterSet).toBe(false);
    await updateSettings({ askDifficultyAfterSet: true });
    expect((await getSettings()).askDifficultyAfterSet).toBe(true);
  });

  it('afterExerciseDone: domyślnie next, zmiana zostaje zapisana', async () => {
    expect((await getSettings()).afterExerciseDone).toBe('next');
    await updateSettings({ afterExerciseDone: 'list' });
    expect((await getSettings()).afterExerciseDone).toBe('list');
  });

  it('zakres powtórzeń zostaje poprawny', async () => {
    let s = await updateSettings({ defaultRepsMin: 15 });
    expect([s.defaultRepsMin, s.defaultRepsMax]).toEqual([15, 15]);
    s = await updateSettings({ defaultRepsMax: 10 });
    expect([s.defaultRepsMin, s.defaultRepsMax]).toEqual([10, 10]);
  });
});
