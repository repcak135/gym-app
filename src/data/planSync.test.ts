import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { getSettings } from './settings';
import { createPlan, addDay, addItems, updateItem } from './plans';
import { startWorkout, getWorkoutSets, completeSet, finishWorkout, swapExercise, addExercises, addSet, removeExercise } from './workouts';
import { diffWorkoutVsPlan, applyPlanChanges, saveWorkoutAsDay } from './planSync';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function setup(ids = ['a', 'b', 'c']) {
  const plan = await createPlan('P');
  const day = await addDay(plan.id, 'Day 1');
  await addItems(plan.id, day.id, ids);
  for (let i = 0; i < ids.length; i++) await updateItem(plan.id, day.id, i, { sets: 3, warmupSets: 0 });
  return { plan, day };
}

/** Completes every set of the given exercises (all when omitted). */
async function completeAll(workoutId: string, only?: string[]) {
  for (const s of await getWorkoutSets(workoutId)) {
    if (!only || only.includes(s.exerciseId)) await completeSet(s.id, 1000);
  }
}

async function ended(workoutId: string) {
  expect(await finishWorkout(workoutId)).toBe('finished');
}

describe('diffWorkoutVsPlan', () => {
  it('is empty when the workout matches the plan', async () => {
    const { plan, day } = await setup();
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    await completeAll(w.id);
    await ended(w.id);
    expect(await diffWorkoutVsPlan(w.id)).toEqual([]);
  });

  it('is empty for an unfinished or plan-less workout', async () => {
    const { plan, day } = await setup();
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    await completeAll(w.id);
    expect(await diffWorkoutVsPlan(w.id)).toEqual([]);
    await ended(w.id);
    const free = await startWorkout({});
    await addExercises(free.id, ['a']);
    await completeAll(free.id);
    await ended(free.id);
    expect(await diffWorkoutVsPlan(free.id)).toEqual([]);
  });

  it('does not suggest fewer sets when the workout was simply finished early', async () => {
    const { plan, day } = await setup();
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    const first = (await getWorkoutSets(w.id))[0];
    await completeSet(first.id, 1000);
    await ended(w.id);
    expect(await diffWorkoutVsPlan(w.id)).toEqual([]);
  });

  it('suggests fewer sets when a set was removed on purpose', async () => {
    const { plan, day } = await setup();
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    const { removeSet } = await import('./workouts');
    const aSets = (await getWorkoutSets(w.id)).filter((s) => s.exerciseId === 'a');
    await removeSet(aSets[2].id);
    await completeAll(w.id);
    await ended(w.id);
    expect(await diffWorkoutVsPlan(w.id)).toEqual([{ kind: 'sets', exerciseId: 'a', from: 3, to: 2 }]);
  });

  it('detects a swap', async () => {
    const { plan, day } = await setup();
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    await swapExercise(w.id, 1, 'x');
    await completeAll(w.id);
    await ended(w.id);
    expect(await diffWorkoutVsPlan(w.id)).toEqual([
      { kind: 'swap', index: 1, fromExerciseId: 'b', toExerciseId: 'x' },
    ]);
  });

  it('detects an added and a removed exercise', async () => {
    const { plan, day } = await setup();
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    await removeExercise(w.id, 0);
    await addExercises(w.id, ['x']);
    await completeAll(w.id);
    await ended(w.id);
    const changes = await diffWorkoutVsPlan(w.id);
    expect(changes).toContainEqual({ kind: 'remove', exerciseId: 'a' });
    const add = changes.find((c) => c.kind === 'add');
    expect(add).toMatchObject({ kind: 'add', exerciseId: 'x' });
    expect(add && add.kind === 'add' && add.item.sets).toBe((await getSettings()).defaultSets);
    expect(changes).toHaveLength(2);
  });

  it('detects changed working-set and warm-up counts, ignores untouched exercises', async () => {
    const { plan, day } = await setup();
    await updateItem(plan.id, day.id, 0, { warmupSets: 2 });
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    await addSet(w.id, 0);
    // a: complete 1 warm-up of 2 and all 4 working sets
    const sets = await getWorkoutSets(w.id);
    const aWarm = sets.filter((s) => s.exerciseId === 'a' && s.warmup);
    await completeSet(aWarm[0].id, 1000);
    for (const s of sets.filter((x) => ['a', 'b'].includes(x.exerciseId) && !x.warmup)) await completeSet(s.id, 1000);
    // c: nothing completed -> no change reported, exercise stays.
    // a: the skipped warm-up was not removed on purpose, so the plan keeps 2 warm-ups.
    await ended(w.id);
    const changes = await diffWorkoutVsPlan(w.id);
    expect(changes).toEqual([{ kind: 'sets', exerciseId: 'a', from: 3, to: 4 }]);
  });
});

describe('applyPlanChanges', () => {
  it('applies swap, add, remove, sets and warmups in one go', async () => {
    const { plan, day } = await setup();
    await updateItem(plan.id, day.id, 1, { repsMin: 5, repsMax: 6, restSec: 60 });
    await applyPlanChanges(plan.id, day.id, [
      { kind: 'remove', exerciseId: 'a' },
      { kind: 'swap', index: 1, fromExerciseId: 'b', toExerciseId: 'x' },
      { kind: 'sets', exerciseId: 'c', from: 3, to: 5 },
      { kind: 'warmups', exerciseId: 'c', from: 0, to: 2 },
      { kind: 'add', exerciseId: 'n', item: { exerciseId: 'n', sets: 2, warmupSets: 1, repsMin: 6, repsMax: 8, restSec: 90 } },
    ]);
    const items = (await db.plans.get(plan.id))!.days[0].items;
    expect(items.map((i) => i.exerciseId)).toEqual(['x', 'c', 'n']);
    expect(items[0]).toMatchObject({ repsMin: 5, repsMax: 6, restSec: 60, sets: 3 });
    expect(items[1]).toMatchObject({ sets: 5, warmupSets: 2 });
    expect(items[2]).toMatchObject({ sets: 2, warmupSets: 1, restSec: 90 });
  });

  it('round trip: diff then apply leaves no further diff', async () => {
    const { plan, day } = await setup();
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    await swapExercise(w.id, 0, 'x');
    await addSet(w.id, 1);
    await completeAll(w.id);
    await ended(w.id);
    const changes = await diffWorkoutVsPlan(w.id);
    expect(changes.length).toBeGreaterThan(0);
    await applyPlanChanges(plan.id, day.id, changes);
    expect(await diffWorkoutVsPlan(w.id)).toEqual([]);
  });
});

describe('saveWorkoutAsDay', () => {
  async function freeWorkout() {
    const w = await startWorkout({});
    await addExercises(w.id, ['a', 'b']);
    const sets = await getWorkoutSets(w.id);
    // a: complete two sets; b: nothing completed
    for (const s of sets.filter((x) => x.exerciseId === 'a').slice(0, 2)) await completeSet(s.id, 1000);
    await ended(w.id);
    return w;
  }

  it('creates a new plan, activates it and links the workout', async () => {
    const w = await freeWorkout();
    const res = await saveWorkoutAsDay(w.id, { newPlanName: 'Mój plan' }, 'Push');
    const plan = await db.plans.get(res.planId);
    expect(plan?.name).toBe('Mój plan');
    expect(plan?.days).toHaveLength(1);
    expect(plan?.days[0]).toMatchObject({ id: res.dayId, name: 'Push' });
    expect(plan?.days[0].items.map((i) => i.exerciseId)).toEqual(['a']); // b skipped
    expect(plan?.days[0].items[0].sets).toBe(2);
    expect((await getSettings()).activePlanId).toBe(res.planId);
    expect(await db.workouts.get(w.id)).toMatchObject({ planId: res.planId, dayId: res.dayId });
  });

  it('adds a day to an existing plan without changing the active plan', async () => {
    const { plan } = await setup(['z']);
    const w = await freeWorkout();
    const res = await saveWorkoutAsDay(w.id, { planId: plan.id }, 'Pull');
    expect(res.planId).toBe(plan.id);
    const saved = await db.plans.get(plan.id);
    expect(saved?.days.map((d) => d.name)).toEqual(['Day 1', 'Pull']);
    expect((await getSettings()).activePlanId).toBe(plan.id);
    expect(await diffWorkoutVsPlan(w.id)).toEqual([]);
  });
});
