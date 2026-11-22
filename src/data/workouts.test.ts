import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { updateSettings } from './settings';
import { createPlan, addDay, addItems, updateItem, getLastPlanDayId } from './plans';
import {
  getActiveWorkout,
  startWorkout,
  getWorkoutSets,
  completeSet,
  uncompleteSet,
  updateSet,
  setCurrentIndex,
  extendRest,
  skipRest,
  swapExercise,
  removeExercise,
  addExercises,
  addSet,
  finishWorkout,
  discardWorkout,
  summarizeWorkout,
  getLastSets,
  applyWeight,
} from './workouts';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function planDay(exerciseIds = ['bench', 'row']) {
  const plan = await createPlan('P');
  const day = await addDay(plan.id, 'Day 1 Upper');
  await addItems(plan.id, day.id, exerciseIds);
  await updateItem(plan.id, day.id, 0, { warmupSets: 1, sets: 3, repsMin: 8, repsMax: 12, restSec: 90 });
  return { plan, day };
}

/** Starts, completes every set with the given weight/reps, finishes. */
async function doWorkout(planId: string, dayId: string, weight: number, reps: number, startedAt: number) {
  const w = await startWorkout({ planId, dayId });
  await db.workouts.update(w.id, { startedAt });
  for (const s of await getWorkoutSets(w.id)) {
    await updateSet(s.id, { weight, reps });
    await completeSet(s.id, startedAt + 1000);
  }
  await finishWorkout(w.id, startedAt + 3600_000);
  return w;
}

describe('startWorkout', () => {
  it('creates warm-up + working sets from the plan day and saves plan/day ids', async () => {
    const { plan, day } = await planDay();
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    expect(w.name).toBe('Day 1 Upper');
    const sets = await getWorkoutSets(w.id);
    const bench = sets.filter((s) => s.exerciseId === 'bench');
    expect(bench.map((s) => s.warmup)).toEqual([true, false, false, false]);
    expect(bench[1]).toMatchObject({ weight: 0, reps: 8, exerciseOrder: 0 });
    expect(sets.filter((s) => s.exerciseId === 'row')).toHaveLength(3);
    await finishWorkout(w.id); // empty -> untouched
    expect((await getActiveWorkout())?.id).toBe(w.id);
  });

  it('returns the running workout instead of starting a second one', async () => {
    const a = await startWorkout({});
    const b = await startWorkout({});
    expect(b.id).toBe(a.id);
    expect(a.name).toBe('Trening');
  });

  it('prefills from the last finished workout of that exercise', async () => {
    const { plan, day } = await planDay();
    await doWorkout(plan.id, day.id, 35, 10, 1_000_000);
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    const bench = (await getWorkoutSets(w.id)).filter((s) => s.exerciseId === 'bench' && !s.warmup);
    expect(bench.map((s) => [s.weight, s.reps])).toEqual([[35, 10], [35, 10], [35, 10]]);
    expect(await getLastPlanDayId(plan.id)).toBe(day.id);
  });
});

describe('rep range and progression prefill', () => {
  async function dayWithRange(repsMin: number, repsMax: number) {
    const plan = await createPlan('R');
    const day = await addDay(plan.id, 'D');
    await addItems(plan.id, day.id, ['lift']);
    await updateItem(plan.id, day.id, 0, { sets: 3, warmupSets: 0, repsMin, repsMax });
    return { plan, day };
  }

  it('heavy lift 6–8: range comes from the plan item; all at 8 → next prefilled +2,5 kg × 6', async () => {
    const { plan, day } = await dayWithRange(6, 8);
    await doWorkout(plan.id, day.id, 100, 8, 1_000_000);
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    expect(w.exercises?.[0]).toMatchObject({ repsMin: 6, repsMax: 8 });
    const sets = await getWorkoutSets(w.id);
    expect(sets.map((s) => [s.weight, s.reps])).toEqual([[102.5, 6], [102.5, 6], [102.5, 6]]);
  });

  it('isolation 10–12: 10 reps is not the top → same weight and reps kept', async () => {
    const { plan, day } = await dayWithRange(10, 12);
    await doWorkout(plan.id, day.id, 20, 10, 1_000_000);
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    expect(w.exercises?.[0]).toMatchObject({ repsMin: 10, repsMax: 12 });
    expect((await getWorkoutSets(w.id)).map((s) => [s.weight, s.reps])).toEqual([[20, 10], [20, 10], [20, 10]]);
  });

  it('exercise step overrides the settings step', async () => {
    const { plan, day } = await dayWithRange(6, 8);
    await db.exercises.put({ id: 'lift', name: 'Lift', primaryMuscles: [], secondaryMuscles: [], equipment: null, category: 'strength', instructions: [], images: [], custom: true, weightStep: 1 });
    await doWorkout(plan.id, day.id, 40, 8, 1_000_000);
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    expect((await getWorkoutSets(w.id))[0]).toMatchObject({ weight: 41, reps: 6 });
  });

  it('outside a plan (empty workout) the Ustawienia default range is used', async () => {
    await updateSettings({ defaultRepsMin: 10, defaultRepsMax: 15 });
    const w = await startWorkout({});
    await addExercises(w.id, ['curl']);
    expect((await db.workouts.get(w.id))?.exercises?.[0]).toMatchObject({ repsMin: 10, repsMax: 15 });
  });

  it('rir is stored per set and can be cleared', async () => {
    const w = await startWorkout({});
    await addExercises(w.id, ['curl']);
    const [s] = await getWorkoutSets(w.id);
    await updateSet(s.id, { rir: 1 });
    expect((await db.sets.get(s.id))?.rir).toBe(1);
    await updateSet(s.id, { rir: 9 });
    expect((await db.sets.get(s.id))?.rir).toBe(5);
    await updateSet(s.id, { rir: null });
    expect((await db.sets.get(s.id))?.rir).toBeUndefined();
  });
});

describe('sets and rest', () => {
  it('completeSet starts the rest timer from the exercise rest time', async () => {
    const { plan, day } = await planDay();
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    const [first] = await getWorkoutSets(w.id);
    await completeSet(first.id, 50_000);
    const after = await db.workouts.get(w.id);
    expect(after?.restEndsAt).toBe(50_000 + 90_000);
    expect(after?.restTotalSec).toBe(90);
    await extendRest(w.id, 15, 60_000);
    expect((await db.workouts.get(w.id))?.restEndsAt).toBe(155_000);
    await skipRest(w.id);
    expect((await db.workouts.get(w.id))?.restEndsAt).toBeUndefined();
    await uncompleteSet(first.id);
    expect((await db.sets.get(first.id))?.completedAt).toBeUndefined();
  });

  it('updateSet ignores NaN and clamps', async () => {
    const w = await startWorkout({});
    await addExercises(w.id, ['bench']);
    const [s] = await getWorkoutSets(w.id);
    await updateSet(s.id, { weight: Number.NaN, reps: -3 });
    expect(await db.sets.get(s.id)).toMatchObject({ weight: 0, reps: 0 });
    await updateSet(s.id, { weight: 37.5 });
    expect((await db.sets.get(s.id))?.weight).toBe(37.5);
  });

  it('resume: active workout keeps index, rest end and completed sets', async () => {
    const { plan, day } = await planDay();
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    await setCurrentIndex(w.id, 1);
    const sets = await getWorkoutSets(w.id);
    await completeSet(sets[4].id, 10_000);
    const resumed = await getActiveWorkout();
    expect(resumed).toMatchObject({ id: w.id, currentIndex: 1, restEndsAt: 10_000 + 120_000 });
    expect((await getWorkoutSets(w.id)).filter((s) => s.completedAt)).toHaveLength(1);
  });

  it('addSet copies the last working set; applyWeight touches only undone working sets', async () => {
    const w = await startWorkout({});
    await addExercises(w.id, ['bench']);
    const sets = await getWorkoutSets(w.id);
    await updateSet(sets[2].id, { weight: 50, reps: 6 });
    await addSet(w.id, 0);
    const after = await getWorkoutSets(w.id);
    expect(after).toHaveLength(4);
    expect(after[3]).toMatchObject({ weight: 50, reps: 6, setOrder: 3 });
    await completeSet(after[0].id);
    await applyWeight(w.id, 'bench', 60);
    const final = await getWorkoutSets(w.id);
    expect(final.map((s) => s.weight)).toEqual([0, 60, 60, 60]);
  });
});

describe('exercises mid-workout', () => {
  it('swap refuses when the exercise has completed sets', async () => {
    const { plan, day } = await planDay();
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    const [first] = await getWorkoutSets(w.id);
    await completeSet(first.id);
    await expect(swapExercise(w.id, 0, 'squat')).rejects.toThrow('Ćwiczenie ma zaliczone serie');
    expect((await getWorkoutSets(w.id)).filter((s) => s.exerciseId === 'bench')).toHaveLength(4);
  });

  it('swap replaces exercise and its sets in place', async () => {
    const { plan, day } = await planDay();
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    await swapExercise(w.id, 1, 'squat');
    const after = await db.workouts.get(w.id);
    expect(after?.exercises?.map((e) => e.exerciseId)).toEqual(['bench', 'squat']);
    const sets = await getWorkoutSets(w.id);
    expect(sets.some((s) => s.exerciseId === 'row')).toBe(false);
    expect(sets.filter((s) => s.exerciseId === 'squat').every((s) => s.exerciseOrder === 1)).toBe(true);
  });

  it('remove deletes the sets and renumbers exerciseOrder', async () => {
    const { plan, day } = await planDay(['bench', 'row', 'squat']);
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    await setCurrentIndex(w.id, 2);
    await removeExercise(w.id, 0);
    const after = await db.workouts.get(w.id);
    expect(after?.exercises?.map((e) => e.exerciseId)).toEqual(['row', 'squat']);
    expect(after?.currentIndex).toBe(1);
    const sets = await getWorkoutSets(w.id);
    expect(sets.some((s) => s.exerciseId === 'bench')).toBe(false);
    expect(sets.filter((s) => s.exerciseId === 'squat').every((s) => s.exerciseOrder === 1)).toBe(true);
  });

  it('addExercises skips exercises already in the workout', async () => {
    const w = await startWorkout({});
    await addExercises(w.id, ['bench', 'bench', 'row']);
    expect((await db.workouts.get(w.id))?.exercises?.map((e) => e.exerciseId)).toEqual(['bench', 'row']);
  });
});

describe('finish and summary', () => {
  it('finish drops undone sets; empty finish leaves the workout for discarding', async () => {
    const w = await startWorkout({});
    await addExercises(w.id, ['bench']);
    expect(await finishWorkout(w.id)).toBe('empty');
    const sets = await getWorkoutSets(w.id);
    await completeSet(sets[0].id);
    expect(await finishWorkout(w.id, Date.now())).toBe('finished');
    expect(await getWorkoutSets(w.id)).toHaveLength(1);
    expect(await getActiveWorkout()).toBeUndefined();

    const w2 = await startWorkout({});
    await discardWorkout(w2.id);
    expect(await db.workouts.get(w2.id)).toBeUndefined();
  });

  it('summary excludes warm-ups and reports records only against earlier history', async () => {
    const { plan, day } = await planDay(['bench']);
    const first = await doWorkout(plan.id, day.id, 40, 10, 1_000_000);
    const s1 = await summarizeWorkout(first.id);
    expect(s1.records).toEqual([]); // first time: no records
    expect(s1.sets).toBe(3); // warm-up not counted
    expect(s1.volume).toBe(1200);
    expect(s1.durationSec).toBe(3600);

    const second = await doWorkout(plan.id, day.id, 45, 10, 2_000_000);
    const s2 = await summarizeWorkout(second.id);
    expect(s2.records.map((r) => r.kind).sort()).toEqual(['e1rm', 'volume', 'weight']);
    expect(s2.records.find((r) => r.kind === 'weight')?.value).toBe(45);

    const last = await getLastSets('bench');
    expect(last.every((s) => s.workoutId === second.id)).toBe(true);
  });

  it('a heavier warm-up is not a record', async () => {
    const { plan, day } = await planDay(['bench']);
    await doWorkout(plan.id, day.id, 40, 10, 1_000_000);
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    const sets = await getWorkoutSets(w.id);
    await updateSet(sets[0].id, { weight: 100, reps: 10 }); // warm-up
    await completeSet(sets[0].id);
    await updateSet(sets[1].id, { weight: 40, reps: 5 });
    await completeSet(sets[1].id);
    await finishWorkout(w.id);
    expect((await summarizeWorkout(w.id)).records).toEqual([]);
  });
});
