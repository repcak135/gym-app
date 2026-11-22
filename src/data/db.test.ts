import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import type { Workout, WorkoutSet } from './types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('db', () => {
  it('zapis treningu i serii przetrwa ponowne otwarcie bazy', async () => {
    const workoutId = crypto.randomUUID();
    const workout: Workout = {
      id: workoutId,
      name: 'Test workout',
      startedAt: Date.now(),
      source: 'app',
    };
    await db.workouts.add(workout);

    const set1: WorkoutSet = {
      id: crypto.randomUUID(),
      workoutId,
      exerciseId: 'ex1',
      exerciseOrder: 0,
      setOrder: 0,
      weight: 100,
      reps: 5,
      warmup: false,
    };
    const set2: WorkoutSet = {
      id: crypto.randomUUID(),
      workoutId,
      exerciseId: 'ex1',
      exerciseOrder: 0,
      setOrder: 1,
      weight: 100,
      reps: 5,
      warmup: false,
    };
    await db.sets.bulkAdd([set1, set2]);

    db.close();
    await db.open();

    const sets = await db.sets.where('workoutId').equals(workoutId).toArray();
    expect(sets).toHaveLength(2);
    expect(sets[0].weight).toBe(100);
    expect(sets[0].reps).toBe(5);
    expect(sets[1].weight).toBe(100);
    expect(sets[1].reps).toBe(5);
  });

  it('serie ćwiczenia da się pobrać po exerciseId', async () => {
    const workout1Id = crypto.randomUUID();
    const workout2Id = crypto.randomUUID();

    await db.workouts.bulkAdd([
      { id: workout1Id, name: 'W1', startedAt: Date.now(), source: 'app' },
      { id: workout2Id, name: 'W2', startedAt: Date.now(), source: 'app' },
    ]);

    const sets: WorkoutSet[] = [
      { id: crypto.randomUUID(), workoutId: workout1Id, exerciseId: 'ex1', exerciseOrder: 0, setOrder: 0, weight: 80, reps: 8, warmup: false },
      { id: crypto.randomUUID(), workoutId: workout1Id, exerciseId: 'ex1', exerciseOrder: 0, setOrder: 1, weight: 80, reps: 8, warmup: false },
      { id: crypto.randomUUID(), workoutId: workout2Id, exerciseId: 'ex1', exerciseOrder: 0, setOrder: 0, weight: 85, reps: 6, warmup: false },
      { id: crypto.randomUUID(), workoutId: workout2Id, exerciseId: 'ex2', exerciseOrder: 1, setOrder: 0, weight: 60, reps: 10, warmup: false },
    ];
    await db.sets.bulkAdd(sets);

    const count = await db.sets.where('exerciseId').equals('ex1').count();
    expect(count).toBe(3);
  });
});
