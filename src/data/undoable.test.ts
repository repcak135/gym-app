import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { getSettings } from './settings';
import { createPlan, addDay, addItems, renameDay } from './plans';
import { saveBodyEntry } from './body';
import { createCustomExercise, saveNote } from './exercises';
import {
  removePlanUndoable, removeDayUndoable, removeItemUndoable, removeWorkoutUndoable,
  removeBodyEntryUndoable, removeCustomExerciseUndoable,
} from './undoable';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const exInput = { name: 'Moje', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: null };

describe('undoable deletes', () => {
  it('plan delete + restore keeps days and active flag', async () => {
    const plan = await createPlan('A');
    await addDay(plan.id, 'D1');
    await addDay(plan.id, 'D2');
    expect((await getSettings()).activePlanId).toBe(plan.id);
    const before = (await db.plans.get(plan.id))!;
    const restore = await removePlanUndoable(plan.id);
    expect(await db.plans.get(plan.id)).toBeUndefined();
    expect((await getSettings()).activePlanId).toBeUndefined();
    await restore();
    expect(await db.plans.get(plan.id)).toEqual(before);
    expect((await getSettings()).activePlanId).toBe(plan.id);
  });

  it('day restore goes back to its index and keeps a later rename of another day', async () => {
    const plan = await createPlan('A');
    const d1 = await addDay(plan.id, 'D1');
    const d2 = await addDay(plan.id, 'D2');
    const d3 = await addDay(plan.id, 'D3');
    const restore = await removeDayUndoable(plan.id, d2.id);
    await renameDay(plan.id, d3.id, 'Renamed');
    await restore();
    const days = (await db.plans.get(plan.id))!.days;
    expect(days.map((d) => d.id)).toEqual([d1.id, d2.id, d3.id]);
    expect(days[2].name).toBe('Renamed');
    await restore(); // second call does nothing
    expect((await db.plans.get(plan.id))!.days).toHaveLength(3);
  });

  it('item restore goes back to its index', async () => {
    const plan = await createPlan('A');
    const day = await addDay(plan.id, 'D1');
    await addItems(plan.id, day.id, ['a', 'b', 'c']);
    const restore = await removeItemUndoable(plan.id, day.id, 1);
    let items = (await db.plans.get(plan.id))!.days[0].items;
    expect(items.map((i) => i.exerciseId)).toEqual(['a', 'c']);
    await restore();
    items = (await db.plans.get(plan.id))!.days[0].items;
    expect(items.map((i) => i.exerciseId)).toEqual(['a', 'b', 'c']);
  });

  it('workout restore brings back all sets', async () => {
    await db.workouts.put({ id: 'w1', name: 'W', startedAt: 1, endedAt: 2, source: 'app' });
    await db.workouts.put({ id: 'w2', name: 'Other', startedAt: 3, source: 'app' });
    const mk = (id: string, workoutId: string, n: number) => ({
      id, workoutId, exerciseId: 'e', exerciseOrder: 0, setOrder: n, weight: 50, reps: 5, warmup: false,
    });
    await db.sets.bulkPut([mk('s1', 'w1', 0), mk('s2', 'w1', 1), mk('s3', 'w2', 0)]);
    const restore = await removeWorkoutUndoable('w1');
    expect(await db.workouts.get('w1')).toBeUndefined();
    expect(await db.sets.count()).toBe(1);
    await restore();
    expect(await db.workouts.get('w1')).toBeDefined();
    expect(await db.sets.where('workoutId').equals('w1').count()).toBe(2);
    expect(await db.sets.count()).toBe(3);
  });

  it('body entry restore', async () => {
    const id = await saveBodyEntry({ date: '2026-01-01', values: { weight: 80, waist: 85 } });
    const before = (await db.body.get(id))!;
    const restore = await removeBodyEntryUndoable(id);
    expect(await db.body.get(id)).toBeUndefined();
    await restore();
    expect(await db.body.get(id)).toEqual(before);
  });

  it('custom exercise used in a plan is refused and stays', async () => {
    const ex = await createCustomExercise(exInput);
    const plan = await createPlan('A');
    const day = await addDay(plan.id, 'D1');
    await addItems(plan.id, day.id, [ex.id]);
    const res = await removeCustomExerciseUndoable(ex.id);
    expect(res.ok).toBe(false);
    expect(await db.exercises.get(ex.id)).toBeDefined();
  });

  it('custom exercise restore brings back its note', async () => {
    const ex = await createCustomExercise(exInput);
    await saveNote(ex.id, 'moja notatka');
    const res = await removeCustomExerciseUndoable(ex.id);
    expect(res.ok).toBe(true);
    expect(await db.exercises.get(ex.id)).toBeUndefined();
    expect(await db.notes.get(ex.id)).toBeUndefined();
    if (res.ok) await res.restore();
    expect(await db.exercises.get(ex.id)).toBeDefined();
    expect((await db.notes.get(ex.id))?.text).toBe('moja notatka');
  });
});
