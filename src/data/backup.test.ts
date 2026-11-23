import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { getSettings, updateSettings } from './settings';
import {
  BACKUP_FORMAT_VERSION, BackupError, backupFileName, backupReminderDue, createBackup, markBackupDone,
  parseBackup, restoreBackup, snoozeBackupReminder, summarizeBackup, type BackupFile,
} from './backup';
import type { Exercise } from './types';

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
    builtIn('Squat'),
    { ...builtIn('custom-1'), name: 'Wiosło Krzywe', custom: true, primaryMuscles: [] },
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
    expect(file.data.exerciseOverrides).toEqual([{ id: 'Bench_Press', weightStep: 1.25, barWeight: 15 }]);
    expect(file.data.settings).not.toHaveProperty('exerciseDbVersion');

    // wipe and change things, then restore from the JSON text
    await Promise.all([db.plans.clear(), db.workouts.clear(), db.sets.clear(), db.notes.clear(), db.aliases.clear(), db.body.clear()]);
    await db.exercises.delete('custom-1');
    await db.exercises.update('Bench_Press', { barWeight: 25 });
    await db.exercises.update('Squat', { weightStep: 5 });
    await db.workouts.add({ id: 'wX', name: 'Nowy', startedAt: 9, source: 'app' });
    await updateSettings({ plates: [25], showRir: false });

    await restoreBackup(parseBackup(JSON.stringify(file)));
    expect(await dump()).toEqual(before);
    const s = await getSettings();
    expect(s).toEqual({ ...settingsBefore, lastBackupAt: 123456 });
    expect(s.exerciseDbVersion).toBe(4);
  });

  it('summary counts', async () => {
    await seedEverything();
    const sum = summarizeBackup(await createBackup(5));
    expect(sum).toMatchObject({ plans: 1, workouts: 2, sets: 2, measurements: 1, customExercises: 1, exportedAt: 5 });
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
    expect(await db.sets.count()).toBe(2);
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
