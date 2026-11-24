import { db } from './db';
import { DEFAULT_SETTINGS } from './settings';
import type { AppSettings } from './types';

export interface UserDataCounts {
  /** Workouts and sets of every origin. */
  workouts: number;
  sets: number;
  importedWorkouts: number;
  importedSets: number;
  plans: number;
  notes: number;
  measurements: number;
  customExercises: number;
  aliases: number;
}

export async function countUserData(): Promise<UserDataCounts> {
  return db.transaction('r', [db.workouts, db.sets, db.plans, db.notes, db.body, db.exercises, db.aliases], async () => {
    const imported = await db.workouts.filter((w) => w.source === 'import').primaryKeys();
    const importedIds = new Set(imported);
    const importedSets = importedIds.size
      ? await db.sets.where('workoutId').anyOf([...importedIds]).count()
      : 0;
    return {
      workouts: await db.workouts.count(),
      sets: await db.sets.count(),
      importedWorkouts: importedIds.size,
      importedSets,
      plans: await db.plans.count(),
      notes: await db.notes.count(),
      measurements: await db.body.count(),
      customExercises: await db.exercises.filter((e) => e.custom).count(),
      aliases: await db.aliases.count(),
    };
  });
}

/** Deletes workouts imported from CSV with their sets and the remembered name matches. Everything else stays. */
export async function deleteImportedHistory(): Promise<{ workouts: number; sets: number }> {
  return db.transaction('rw', [db.workouts, db.sets, db.aliases], async () => {
    const ids = await db.workouts.filter((w) => w.source === 'import').primaryKeys();
    const sets = ids.length ? await db.sets.where('workoutId').anyOf(ids).delete() : 0;
    await db.workouts.bulkDelete(ids);
    await db.aliases.clear();
    return { workouts: ids.length, sets };
  });
}

/**
 * Deletes all user data (also clears any unfinished workout, which is a workout row).
 * The built-in catalogue stays, with its per-exercise settings reset; settings go back
 * to defaults except exerciseDbVersion, so the catalogue is not reseeded.
 */
export async function deleteAllUserData(): Promise<void> {
  await db.transaction('rw', [db.plans, db.workouts, db.sets, db.notes, db.aliases, db.body, db.exercises, db.settings], async () => {
    const device = await db.settings.get('app');
    await Promise.all([
      db.plans.clear(), db.workouts.clear(), db.sets.clear(), db.notes.clear(), db.aliases.clear(), db.body.clear(),
    ]);
    await db.exercises.filter((e) => e.custom).delete();
    await db.exercises
      .filter((e) => e.weightStep !== undefined || e.barWeight !== undefined)
      .modify((e) => { delete e.weightStep; delete e.barWeight; });
    const settings: AppSettings = { ...DEFAULT_SETTINGS, key: 'app' };
    if (device?.exerciseDbVersion !== undefined) settings.exerciseDbVersion = device.exerciseDbVersion;
    await db.settings.clear();
    await db.settings.put(settings);
  });
}
