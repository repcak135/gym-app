import sample from '../../tests/fixtures/sample-export.csv?raw';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { commitImport, prepareImport } from './importHistory';
import { getExerciseHistory } from './workouts';
import type { Exercise } from './types';


const ex = (id: string, name: string): Exercise => ({
  id, name, primaryMuscles: ['chest'], secondaryMuscles: [], equipment: null, category: 'strength',
  instructions: [], images: [], custom: false,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.exercises.bulkAdd([
    ex('db-bench', 'Dumbbell Bench Press'),
    ex('pushdown', 'Triceps Pushdown'),
    ex('lat', 'Wide-Grip Lat Pulldown'),
    ex('squat', 'Barbell Squat'),
    ex('pullups', 'Pullups'),
    ex('hammer', 'Hammer Curls'),
  ]);
});

describe('import', () => {
  it('preview: new workouts, sets, matches (most sets first)', async () => {
    const p = await prepareImport(sample);
    expect(p).toMatchObject({ newWorkouts: 3, existingWorkouts: 0, sets: 12, skipped: 1 });
    const by = Object.fromEntries(p.names.map((n) => [n.sourceName, n]));
    expect(by['Dumbbell Bench Press']).toMatchObject({ how: 'exact', exerciseId: 'db-bench', sets: 2 });
    expect(by['Wide Grip Lat Pull Down']).toMatchObject({ how: 'fuzzy', exerciseId: 'lat' });
    expect(by['Wiosło Krzywe']).toMatchObject({ how: 'none', exerciseId: null, sets: 3 });
    expect(p.names[0].sets).toBeGreaterThanOrEqual(p.names.at(-1)!.sets);
  });

  it('commit creates workouts as imported working sets; second import adds nothing', async () => {
    const p = await prepareImport(sample);
    const res = await commitImport(p, { 'Curl, Hammer Style': 'hammer' });
    expect(res).toEqual({ workouts: 3, sets: 12, created: 1 }); // Wiosło Krzywe → custom
    const custom = await db.exercises.filter((e) => e.custom).toArray();
    expect(custom.map((e) => e.name)).toEqual(['Wiosło Krzywe']);

    const ws = await db.workouts.toArray();
    expect(ws.every((w) => w.source === 'import' && w.endedAt === undefined && w.importKey)).toBe(true);
    const sets = await db.sets.toArray();
    expect(sets.every((s) => !s.warmup && s.completedAt !== undefined)).toBe(true);
    expect((await getExerciseHistory('lat'))[0].sets.map((s) => [s.weight, s.reps])).toEqual([[50, 10], [55, 8]]);

    const again = await prepareImport(sample);
    expect(again).toMatchObject({ newWorkouts: 0, existingWorkouts: 3, sets: 0 });
    expect(await commitImport(again, {})).toEqual({ workouts: 0, sets: 0, created: 0 });
    expect(await db.sets.count()).toBe(12);
  });

  it('remembers matches as aliases for the next file', async () => {
    await commitImport(await prepareImport(sample), { 'Cable Triceps Pushdown': 'pushdown' });
    const extra = sample.replace(/2026-03-0/g, '2026-04-0'); // same names, new dates
    const p = await prepareImport(extra);
    expect(p.newWorkouts).toBe(3);
    const by = Object.fromEntries(p.names.map((n) => [n.sourceName, n]));
    expect(by['Cable Triceps Pushdown']).toMatchObject({ how: 'alias', exerciseId: 'pushdown' });
    expect(by['Wiosło Krzywe'].how).toBe('alias');
    const res = await commitImport(p, {});
    expect(res.created).toBe(0);
  });

  it('two names mapped to one exercise in a workout become one block with continuing set order', async () => {
    const p = await prepareImport(sample);
    await commitImport(p, { 'Curl, Hammer Style': 'lat' }); // Pull A: lat ×2, "curl" ×1 → lat
    const pull = (await db.workouts.toArray()).find((w) => w.name === 'Pull A')!;
    const sets = (await db.sets.where('workoutId').equals(pull.id).toArray()).filter((s) => s.exerciseId === 'lat');
    expect(sets.map((s) => [s.exerciseOrder, s.setOrder]).sort()).toEqual([[0, 0], [0, 1], [0, 2]]);
  });

  it('two different names both set to custom with the same name create one exercise', async () => {
    const text = sample.replace('Wiosło Krzywe ,1', 'wiosło krzywe,1');
    const p = await prepareImport(text);
    const res = await commitImport(p, { 'wiosło krzywe': 'custom', 'Wiosło Krzywe': 'custom' });
    expect(res.created).toBe(1);
  });
});
