import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createPlan } from './plans';
import { getSettings, updateSettings } from './settings';
import { createPlanFromCandidates, planCandidates } from './planFromHistory';
import type { WorkoutSet } from './types';

let seq = 0;
async function addWorkout(
  name: string,
  startedAt: number,
  sets: { ex: string; order: number; reps: number; warmup?: boolean }[],
  opts: { endedAt?: number | null } = {},
) {
  const id = `w${++seq}`;
  const endedAt = opts.endedAt === null ? undefined : (opts.endedAt ?? startedAt + 1000);
  await db.workouts.add({ id, name, startedAt, endedAt, source: 'app' });
  const rows: WorkoutSet[] = sets.map((s, i) => ({
    id: `${id}-s${i}`,
    workoutId: id,
    exerciseId: s.ex,
    exerciseOrder: s.order,
    setOrder: i,
    weight: 50,
    reps: s.reps,
    warmup: !!s.warmup,
    completedAt: startedAt,
  }));
  await db.sets.bulkAdd(rows);
  return id;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  seq = 0;
});

describe('planCandidates', () => {
  it('groups by name case-insensitively, shows the newest spelling and counts occurrences', async () => {
    await addWorkout('upper', 1000, [{ ex: 'a', order: 0, reps: 10 }]);
    await addWorkout('Upper ', 3000, [{ ex: 'a', order: 0, reps: 10 }]);
    await addWorkout('Legs', 2000, [{ ex: 'b', order: 0, reps: 5 }]);
    const c = await planCandidates();
    expect(c.map((x) => x.name)).toEqual(['Upper', 'Legs']);
    expect(c[0]).toMatchObject({ occurrences: 2, lastDate: 3000 });
    expect(c[1].occurrences).toBe(1);
  });

  it('respects the limit: a name only in older workouts is not offered', async () => {
    await addWorkout('Old', 100, [{ ex: 'a', order: 0, reps: 10 }]);
    await addWorkout('New1', 200, [{ ex: 'a', order: 0, reps: 10 }]);
    await addWorkout('New2', 300, [{ ex: 'a', order: 0, reps: 10 }]);
    const c = await planCandidates(2);
    expect(c.map((x) => x.name)).toEqual(['New2', 'New1']);
  });

  it('ignores unfinished workouts and workouts without sets', async () => {
    await addWorkout('Open', 500, [{ ex: 'a', order: 0, reps: 10 }], { endedAt: null });
    await addWorkout('Empty', 400, []);
    expect(await planCandidates()).toEqual([]);
  });

  it('the most recent workout defines exercises, order, sets and reps range; warm-ups counted separately', async () => {
    await addWorkout('Pull', 1000, [{ ex: 'old', order: 0, reps: 12 }]);
    const id = await addWorkout('Pull', 2000, [
      { ex: 'row', order: 1, reps: 8 },
      { ex: 'row', order: 1, reps: 10 },
      { ex: 'row', order: 1, reps: 9 },
      { ex: 'lat', order: 0, reps: 15, warmup: true },
      { ex: 'lat', order: 0, reps: 12 },
      { ex: 'lat', order: 0, reps: 10 },
      { ex: 'only-warm', order: 2, reps: 5, warmup: true },
    ]);
    await updateSettings({ defaultRestSec: 75, defaultRepsMin: 6, defaultRepsMax: 9 });
    const [c] = await planCandidates();
    expect(c.sourceWorkoutId).toBe(id);
    expect(c.occurrences).toBe(2);
    expect(c.items.map((i) => i.exerciseId)).toEqual(['lat', 'row', 'only-warm']);
    expect(c.items[0]).toEqual({ exerciseId: 'lat', sets: 2, warmupSets: 1, repsMin: 10, repsMax: 12, restSec: 75 });
    expect(c.items[1]).toEqual({ exerciseId: 'row', sets: 3, warmupSets: 0, repsMin: 8, repsMax: 10, restSec: 75 });
    expect(c.items[2]).toMatchObject({ warmupSets: 1, repsMin: 6, repsMax: 9 });
  });
});

describe('createPlanFromCandidates', () => {
  it('creates a new plan, active when there was none', async () => {
    await addWorkout('Upper', 1000, [{ ex: 'a', order: 0, reps: 10 }]);
    await addWorkout('Legs', 2000, [{ ex: 'b', order: 0, reps: 5 }]);
    const c = await planCandidates();
    const planId = await createPlanFromCandidates(c, { newPlanName: 'Plan z historii' });
    const plan = (await db.plans.get(planId))!;
    expect(plan.name).toBe('Plan z historii');
    expect(plan.days.map((d) => d.name)).toEqual(['Legs', 'Upper']);
    expect(plan.days[0].items[0].exerciseId).toBe('b');
    expect(new Set(plan.days.map((d) => d.id)).size).toBe(2);
    expect((await getSettings()).activePlanId).toBe(planId);
  });

  it('appends days to an existing plan', async () => {
    await addWorkout('Upper', 1000, [{ ex: 'a', order: 0, reps: 10 }]);
    const existing = await createPlan('Mój');
    const other = await createPlan('Inny');
    const id = await createPlanFromCandidates(await planCandidates(), { planId: existing.id });
    expect(id).toBe(existing.id);
    expect((await db.plans.get(existing.id))!.days.map((d) => d.name)).toEqual(['Upper']);
    expect((await db.plans.get(other.id))!.days).toEqual([]);
    await createPlanFromCandidates(await planCandidates(), { planId: existing.id });
    expect((await db.plans.get(existing.id))!.days).toHaveLength(2);
    expect((await getSettings()).activePlanId).toBe(existing.id);
  });
});
