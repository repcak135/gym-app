import { db } from './db';
import { getSettings, updateSettings } from './settings';
import { deletePlan, deleteDay, removeItem } from './plans';
import { deleteWorkout } from './history';
import { deleteBodyEntry } from './body';
import { deleteCustomExercise } from './exercises';

export type Restore = () => Promise<void>;

const clone = <T>(v: T): T => structuredClone(v);

export async function removePlanUndoable(id: string): Promise<Restore> {
  const plan = await db.plans.get(id);
  if (!plan) throw new Error('Nie znaleziono planu');
  const snapshot = clone(plan);
  const wasActive = (await getSettings()).activePlanId === id;
  await deletePlan(id);
  return async () => {
    await db.plans.put(snapshot);
    if (wasActive) {
      const { activePlanId } = await getSettings();
      const current = activePlanId ? await db.plans.get(activePlanId) : undefined;
      if (!current) await updateSettings({ activePlanId: id });
    }
  };
}

export async function removeDayUndoable(planId: string, dayId: string): Promise<Restore> {
  const plan = await db.plans.get(planId);
  if (!plan) throw new Error('Nie znaleziono planu');
  const index = plan.days.findIndex((d) => d.id === dayId);
  if (index === -1) throw new Error('Nie znaleziono dnia');
  const snapshot = clone(plan.days[index]);
  await deleteDay(planId, dayId);
  return async () => {
    await db.transaction('rw', db.plans, async () => {
      const current = await db.plans.get(planId);
      if (!current || current.days.some((d) => d.id === dayId)) return;
      current.days.splice(Math.min(index, current.days.length), 0, clone(snapshot));
      await db.plans.put(current);
    });
  };
}

export async function removeItemUndoable(planId: string, dayId: string, index: number): Promise<Restore> {
  const plan = await db.plans.get(planId);
  if (!plan) throw new Error('Nie znaleziono planu');
  const day = plan.days.find((d) => d.id === dayId);
  if (!day) throw new Error('Nie znaleziono dnia');
  const item = day.items[index];
  if (!item) throw new Error('Nie znaleziono ćwiczenia');
  const snapshot = clone(item);
  await removeItem(planId, dayId, index);
  return async () => {
    await db.transaction('rw', db.plans, async () => {
      const current = await db.plans.get(planId);
      const curDay = current?.days.find((d) => d.id === dayId);
      if (!current || !curDay) return;
      curDay.items.splice(Math.min(index, curDay.items.length), 0, clone(snapshot));
      await db.plans.put(current);
    });
  };
}

export async function removeWorkoutUndoable(id: string): Promise<Restore> {
  const workout = await db.workouts.get(id);
  if (!workout) throw new Error('Nie znaleziono treningu');
  const sets = await db.sets.where('workoutId').equals(id).toArray();
  await deleteWorkout(id);
  return async () => {
    await db.transaction('rw', db.workouts, db.sets, async () => {
      await db.workouts.put(workout);
      await db.sets.bulkPut(sets);
    });
  };
}

export async function removeBodyEntryUndoable(id: string): Promise<Restore> {
  const entry = await db.body.get(id);
  if (!entry) throw new Error('Nie znaleziono pomiaru');
  await deleteBodyEntry(id);
  return async () => {
    await db.body.put(entry);
  };
}

export async function removeCustomExerciseUndoable(
  id: string,
): Promise<{ ok: true; restore: Restore } | { ok: false; reason: string }> {
  const exercise = await db.exercises.get(id);
  const note = await db.notes.get(id);
  const result = await deleteCustomExercise(id);
  if (!result.ok) return result;
  return {
    ok: true,
    restore: async () => {
      await db.transaction('rw', db.exercises, db.notes, async () => {
        if (exercise) await db.exercises.put(exercise);
        if (note) await db.notes.put(note);
      });
    },
  };
}
