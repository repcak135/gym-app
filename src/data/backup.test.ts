import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { getSettings, updateSettings } from './settings';
import {
  BACKUP_FORMAT_VERSION, BackupError, backupFileName, backupReminderDue, createBackup, markBackupDone,
  parseBackup, restoreBackup, snoozeBackupReminder, summarizeBackup, type BackupFile,
} from './backup';
import type { Exercise } from './types';
import { getTheme, setTheme } from '../theme/themes';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const builtIn = (id: string, extra: Partial<Exercise> = {}): Exercise => ({
  id, name: id, primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'barbell', category: 'strength',
  instructions: [], images: [], custom: false, ...extra,
});

async function seedEverything() {
  await db.exercises.bulkPut([
    builtIn('Bench_Press', { barWeight: 15, weightStep: 1.25 }),
    builtIn('Squat', { measureOverride: 'time' }),
    { ...builtIn('custom-1'), name: 'Wiosło Krzywe', custom: true, primaryMuscles: [], measure: 'distance' },
  ]);
  await db.plans.add({
    id: 'p1', name: 'PPL', startedAt: '2026-11-01',
    days: [{ id: 'd1', name: 'Push', items: [{ exerciseId: 'Bench_Press', sets: 3, warmupSets: 1, repsMin: 6, repsMax: 8, restSec: 150 }] }],
  });
  await db.workouts.bulkAdd([
    { id: 'w1', name: 'Push', startedAt: 1000, endedAt: 2000, planId: 'p1', dayId: 'd1', source: 'app' },
    { id: 'w2', name: 'Import', startedAt: 500, source: 'import', importKey: 'k1' },
  ]);
  await db.sets.bulkAdd([
    { id: 's1', workoutId: 'w1', exerciseId: 'Bench_Press', exerciseOrder: 0, setOrder: 0, weight: 80, reps: 8, warmup: false, completedAt: 1500, rir: 2 },
    { id: 's2', workoutId: 'w2', exerciseId: 'custom-1', exerciseOrder: 0, setOrder: 0, weight: 40.5, reps: 10, warmup: false },
    { id: 's3', workoutId: 'w1', exerciseId: 'Squat', exerciseOrder: 1, setOrder: 0, weight: 20, reps: 0, warmup: false, completedAt: 1600, durationSec: 45, distanceM: 40 },
  ]);
  await db.notes.add({ exerciseId: 'Bench_Press', text: 'łokcie 45°', updatedAt: 7 });
  await db.aliases.add({ sourceName: 'Wiosło Krzywe', exerciseId: 'custom-1' });
  await db.body.add({ id: 'b1', date: '2026-11-20', weightKg: 82.5, measurements: { waist: 85 }, bodyFatPct: 15 });
  await updateSettings({ activePlanId: 'p1', plates: [20, 10, 5], barWeight: 15, showRir: true, exerciseDbVersion: 4 });
}

async function dump() {
  return {
    plans: await db.plans.toArray(),
    workouts: await db.workouts.toArray(),
    sets: await db.sets.toArray(),
    notes: await db.notes.toArray(),
    aliases: await db.aliases.toArray(),
    body: await db.body.toArray(),
    exercises: await db.exercises.orderBy('id').toArray(),
  };
}

describe('backup', () => {
  it('round-trip restores every table, custom exercises and per-exercise settings', async () => {
    await seedEverything();
    const before = await dump();
    const settingsBefore = await getSettings();
    const file = await createBackup(123456);
    expect(file.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(file.appVersion).toMatch(/\d+\.\d+\.\d+/);
    expect(file.data.customExercises.map((e) => e.id)).toEqual(['custom-1']);
    expect(file.data.exerciseOverrides).toEqual([
      { id: 'Bench_Press', weightStep: 1.25, barWeight: 15 },
      { id: 'Squat', measureOverride: 'time' },
    ]);
    expect(file.data.customExercises[0].measure).toBe('distance');
    expect(file.data.settings).not.toHaveProperty('exerciseDbVersion');

    // wipe and change things, then restore from the JSON text
    await Promise.all([db.plans.clear(), db.workouts.clear(), db.sets.clear(), db.notes.clear(), db.aliases.clear(), db.body.clear()]);
    await db.exercises.delete('custom-1');
    await db.exercises.update('Bench_Press', { barWeight: 25 });
    await db.exercises.update('Squat', { weightStep: 5, measureOverride: 'distance' });
    await db.workouts.add({ id: 'wX', name: 'Nowy', startedAt: 9, source: 'app' });
    await updateSettings({ plates: [25], showRir: false });

    await restoreBackup(parseBackup(JSON.stringify(file)));
    expect(await dump()).toEqual(before);
    const timed = await db.sets.get('s3');
    expect(timed).toMatchObject({ durationSec: 45, distanceM: 40 });
    expect((await db.exercises.get('Squat'))?.measureOverride).toBe('time');
    const s = await getSettings();
    expect(s).toEqual({ ...settingsBefore, lastBackupAt: 123456 });
    expect(s.exerciseDbVersion).toBe(4);
  });

  it('push switch and push id stay on this phone: not in the backup, kept on restore', async () => {
    await seedEverything();
    await updateSettings({ restPush: true, pushId: 'a'.repeat(32), pushPromptDone: true });
    const file = await createBackup(5);
    expect(file.data.settings).not.toHaveProperty('restPush');
    expect(file.data.settings).not.toHaveProperty('pushId');
    expect(file.data.settings).not.toHaveProperty('pushPromptDone');
    // a file that somehow carries push fields from another phone must not overwrite ours
    const foreign = { ...file, data: { ...file.data, settings: { ...file.data.settings, restPush: false, pushId: 'b'.repeat(32) } } };
    await restoreBackup(parseBackup(JSON.stringify(foreign)));
    const s = await getSettings();
    expect(s.restPush).toBe(true);
    expect(s.pushId).toBe('a'.repeat(32));
    expect(s.pushPromptDone).toBe(true);
  });

  it('"Wysyłaj raporty błędów" stays on this phone: not in the backup, kept on restore', async () => {
    await seedEverything();
    await updateSettings({ errorReports: false });
    const file = await createBackup(5);
    expect(file.data.settings).not.toHaveProperty('errorReports');
    const foreign = { ...file, data: { ...file.data, settings: { ...file.data.settings, errorReports: true } } };
    await restoreBackup(parseBackup(JSON.stringify(foreign)));
    expect((await getSettings()).errorReports).toBe(false);
  });

  it('restore on a phone without push leaves push off', async () => {
    await seedEverything();
    await restoreBackup(parseBackup(JSON.stringify(await createBackup(5))));
    const s = await getSettings();
    expect(s).not.toHaveProperty('restPush');
    expect(s).not.toHaveProperty('pushId');
  });

  it('round-trip keeps own exercise names and superset/time fields in plans', async () => {
    await seedEverything();
    await db.exercises.update('Bench_Press', { userNames: ['klata płasko'] });
    await db.plans.add({
      id: 'pS', name: 'Super', startedAt: '2026-11-25',
      days: [{ id: 'dS', name: 'A', items: [
        { exerciseId: 'Bench_Press', sets: 3, warmupSets: 1, repsMin: 6, repsMax: 10, restSec: 90, group: 'g1' },
        { exerciseId: 'Squat', sets: 3, warmupSets: 0, repsMin: 1, repsMax: 1, restSec: 60, group: 'g1', targetSec: 45 },
      ] }],
    });
    const file = await createBackup(1);
    await db.exercises.update('Bench_Press', { userNames: undefined });
    await db.plans.clear();
    await restoreBackup(parseBackup(JSON.stringify(file)));
    expect((await db.exercises.get('Bench_Press'))?.userNames).toEqual(['klata płasko']);
    const items = (await db.plans.get('pS'))?.days[0].items;
    expect(items?.map((i) => i.group)).toEqual(['g1', 'g1']);
    expect(items?.[1].targetSec).toBe(45);
  });

  it('carries the colour theme; old files and bad values leave it alone', async () => {
    await seedEverything();
    setTheme('violet');
    const file = await createBackup(1);
    expect(file.theme).toBe('violet');
    setTheme('blue');
    await restoreBackup(parseBackup(JSON.stringify(file)));
    expect(getTheme()).toBe('violet');
    expect(document.documentElement.dataset.theme).toBe('violet');

    const { theme: _t, ...old } = file;
    void _t;
    await restoreBackup(parseBackup(JSON.stringify(old)));
    expect(getTheme()).toBe('violet');
    expect(parseBackup(JSON.stringify({ ...file, theme: 'neon' })).theme).toBeUndefined();
  });

  it('summary counts', async () => {
    await seedEverything();
    const sum = summarizeBackup(await createBackup(5));
    expect(sum).toMatchObject({ plans: 1, workouts: 2, sets: 3, measurements: 1, customExercises: 1, exportedAt: 5 });
  });

  it('file name uses the local date', () => {
    expect(backupFileName(new Date(2026, 10, 5, 23, 30))).toBe('gym-kopia-2026-11-05.json');
  });

  it('older file without newer tables restores them empty', async () => {
    await seedEverything();
    const file = await createBackup(1);
    const old = JSON.parse(JSON.stringify(file));
    delete old.data.body;
    delete old.data.exerciseOverrides;
    delete old.data.settings;
    old.formatVersion = 0;
    const parsed = parseBackup(JSON.stringify(old));
    expect(parsed.data.body).toEqual([]);
    expect(parsed.data.exerciseOverrides).toEqual([]);
    await restoreBackup(parsed);
    expect(await db.body.count()).toBe(0);
    expect(await db.sets.count()).toBe(3);
    expect((await getSettings()).plates).toEqual([25, 20, 15, 10, 5, 2.5, 1.25]);
  });

  it('rejects a file from a newer app version', async () => {
    const file = await createBackup(1);
    expect(() => parseBackup(JSON.stringify({ ...file, formatVersion: 99 }))).toThrow(/nowszej wersji/);
  });

  it('rejects bad files with a Polish message', async () => {
    const good = await createBackup(1);
    const bad = [
      'nie json',
      '{}',
      JSON.stringify({ app: 'inna', formatVersion: 1 }),
      JSON.stringify({ ...good, data: { ...good.data, sets: 'x' } }),
      JSON.stringify({ ...good, data: { ...good.data, workouts: [{ id: 'w', startedAt: 'wczoraj' }] } }),
      JSON.stringify({ ...good, exportedAt: undefined }),
    ];
    for (const text of bad) expect(() => parseBackup(text)).toThrow(BackupError);
  });

  it('ignores unknown or wrong-typed settings', async () => {
    const good = await createBackup(1);
    const f = parseBackup(JSON.stringify({ ...good, data: { ...good.data, settings: { barWeight: 'x', plates: [20, -5], restSound: false, hack: 1 } } }));
    expect(f.data.settings).toEqual({ restSound: false });
  });

  it('old backup without a sound preset: muted stays silent, otherwise the default bell; bad preset ignored', async () => {
    const good = await createBackup(1);
    const make = (settings: object) => parseBackup(JSON.stringify({ ...good, data: { ...good.data, settings } }));
    await restoreBackup(make({ restSound: false }));
    expect((await getSettings()).restSoundPreset).toBe('silent');
    await restoreBackup(make({}));
    const s = await getSettings();
    expect([s.restSoundPreset, s.restTicks]).toEqual(['bell', true]);
    expect(make({ restSoundPreset: 'nope' }).data.settings).toEqual({});
    await restoreBackup(make({ restSoundPreset: 'gong', restTicks: false }));
    const g = await getSettings();
    expect([g.restSoundPreset, g.restTicks]).toEqual(['gong', false]);
  });

  it('a failing restore leaves the existing data untouched', async () => {
    await seedEverything();
    const before = await dump();
    const file = await createBackup(1);
    const broken: BackupFile = JSON.parse(JSON.stringify(file));
    // bypasses parseBackup: a row without a key makes the database refuse it mid-restore
    (broken.data.sets as unknown[]).push({ workoutId: 'w1', exerciseId: 'x', weight: 1, reps: 1 });
    broken.data.plans = [];
    await expect(restoreBackup(broken)).rejects.toThrow();
    expect(await dump()).toEqual(before);
  });
});

describe('backup reminder', () => {
  const now = Date.UTC(2026, 10, 23);
  const days = (n: number) => n * 24 * 60 * 60 * 1000;

  it('rules', () => {
    expect(backupReminderDue({}, true, now)).toBe(true);
    expect(backupReminderDue({}, false, now)).toBe(false);
    expect(backupReminderDue({ lastBackupAt: now - days(13) }, true, now)).toBe(false);
    expect(backupReminderDue({ lastBackupAt: now - days(15) }, true, now)).toBe(true);
    expect(backupReminderDue({ backupReminderSnoozedUntil: now + 1 }, true, now)).toBe(false);
    expect(backupReminderDue({ backupReminderSnoozedUntil: now - 1 }, true, now)).toBe(true);
  });

  it('snooze lasts 3 days, a backup clears it', async () => {
    await snoozeBackupReminder(now);
    const s = await getSettings();
    expect(backupReminderDue(s, true, now + days(2.9))).toBe(false);
    expect(backupReminderDue(s, true, now + days(3.1))).toBe(true);
    await markBackupDone(now);
    const s2 = await getSettings();
    expect(s2.lastBackupAt).toBe(now);
    expect(s2.backupReminderSnoozedUntil).toBeUndefined();
  });
});
