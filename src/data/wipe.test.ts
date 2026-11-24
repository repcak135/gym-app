import sample from '../../tests/fixtures/sample-export.csv?raw';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { commitImport, prepareImport } from './importHistory';
import { countUserData, deleteAllUserData, deleteImportedHistory } from './wipe';
import { DEFAULT_SETTINGS } from './settings';
import type { Exercise } from './types';

const ex = (id: string, name: string): Exercise => ({
  id, name, primaryMuscles: [], secondaryMuscles: [], equipment: null, category: 'strength',
  instructions: [], images: [], custom: false,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.exercises.bulkAdd([ex('lat', 'Wide-Grip Lat Pulldown'), ex('squat', 'Barbell Squat')]);
  await commitImport(await prepareImport(sample), {});
  // app-made data
  await db.workouts.add({ id: 'app-w', name: 'Mój', startedAt: 1, endedAt: 2, source: 'app' });
  await db.sets.add({ id: 'app-s', workoutId: 'app-w', exerciseId: 'squat', exerciseOrder: 0, setOrder: 0, weight: 100, reps: 5, warmup: false });
  await db.plans.add({ id: 'p1', name: 'Plan', startedAt: '2026-01-01', days: [] });
  await db.notes.add({ exerciseId: 'squat', text: 'n', updatedAt: 1 });
  await db.body.add({ id: 'b1', date: '2026-01-01', measurements: {} });
  await db.exercises.update('squat', { weightStep: 5 });
  await db.settings.put({ ...DEFAULT_SETTINGS, showRir: true, exerciseDbVersion: 7 });
});

describe('wipe', () => {
  it('counts user data', async () => {
    const c = await countUserData();
    expect(c).toMatchObject({
      workouts: 4, sets: 13, importedWorkouts: 3, importedSets: 12,
      plans: 1, notes: 1, measurements: 1, customExercises: 5,
    });
  });

  it('deleteImportedHistory removes only imported workouts and their sets', async () => {
    expect(await deleteImportedHistory()).toEqual({ workouts: 3, sets: 12 });
    expect(await db.workouts.toArray()).toHaveLength(1);
    expect(await db.sets.toArray()).toHaveLength(1);
    expect(await db.aliases.count()).toBe(0);
    expect(await db.plans.count()).toBe(1);
    expect(await db.notes.count()).toBe(1);
    expect(await db.body.count()).toBe(1);
    expect(await db.exercises.filter((e) => e.custom).count()).toBe(5);
    // the same file is new again
    expect(await prepareImport(sample)).toMatchObject({ newWorkouts: 3, existingWorkouts: 0 });
  });

  it('deleteAllUserData keeps the built-in catalogue and exerciseDbVersion', async () => {
    await deleteAllUserData();
    for (const t of [db.workouts, db.sets, db.plans, db.notes, db.body, db.aliases]) expect(await t.count()).toBe(0);
    expect((await db.exercises.toArray()).map((e) => e.id).sort()).toEqual(['lat', 'squat']);
    expect((await db.exercises.get('squat'))!.weightStep).toBeUndefined();
    const s = await db.settings.get('app');
    expect(s).toMatchObject({ showRir: false, exerciseDbVersion: 7 });
  });
});

describe('import: all duplicates', () => {
  it('second prepare reports zero new workouts', async () => {
    const again = await prepareImport(sample);
    expect(again).toMatchObject({ newWorkouts: 0, existingWorkouts: 3 });
  });
});
