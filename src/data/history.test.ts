import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { deleteWorkout, getExerciseRecords, getTimeDistanceRecords, getWorkoutDetail, listFinishedWorkouts, workoutDays } from './history';
import { computeRecords } from './records';
import { summarizeWorkout } from './workouts';
import type { Workout, WorkoutSet } from './types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

let n = 0;
type S = [exerciseId: string, weight: number, reps: number, warmup?: boolean];
async function workout(startedAt: number, sets: S[], extra: Partial<Workout> = {}): Promise<Workout> {
  const w: Workout = { id: `w${++n}`, name: `T${n}`, startedAt, endedAt: startedAt + 3600_000, source: 'app', ...extra };
  await db.workouts.add(w);
  await db.sets.bulkAdd(
    sets.map(([exerciseId, weight, reps, warmup], i): WorkoutSet => ({
      id: `${w.id}-s${i}`, workoutId: w.id, exerciseId, exerciseOrder: 0, setOrder: i,
      weight, reps, warmup: !!warmup, completedAt: startedAt,
    })),
  );
  return w;
}
const day = (d: number) => new Date(2026, 10, d, 18, 0).getTime();

describe('records', () => {
  it('ignore warm-ups and 0-rep sets; Epley 1RM; volume per workout; best reps per weight', async () => {
    await workout(day(1), [['bench', 100, 3, true], ['bench', 60, 10], ['bench', 60, 8], ['bench', 70, 0]]);
    await workout(day(3), [['bench', 65, 6], ['bench', 60, 12]]);
    const r = (await getExerciseRecords('bench'))!;
    expect(r.heaviest).toEqual({ weight: 65, reps: 6, at: day(3) });
    expect(r.e1rm).toMatchObject({ value: 84, weight: 60, reps: 12 }); // 60 × (1 + 12/30)
    expect(r.volume).toEqual({ value: 1110, at: day(3) }); // 600 + 480 = 1080 vs 390 + 720 = 1110
    expect(r.repsAtWeight).toEqual([
      { weight: 65, reps: 6, at: day(3) },
      { weight: 60, reps: 12, at: day(3) },
    ]);
  });

  it('longest time and distance come from completed working sets with duration / distance', async () => {
    const w1 = await workout(day(1), [['plank', 0, 0], ['plank', 0, 0], ['plank', 0, 0, true], ['walk', 25, 0]]);
    await db.sets.update(`${w1.id}-s0`, { durationSec: 60 });
    await db.sets.update(`${w1.id}-s1`, { durationSec: 90 });
    await db.sets.update(`${w1.id}-s2`, { durationSec: 300 }); // warm-up: ignored
    await db.sets.update(`${w1.id}-s3`, { distanceM: 40 });
    const w2 = await workout(day(3), [['plank', 0, 0], ['plank', 0, 0]]);
    await db.sets.update(`${w2.id}-s0`, { durationSec: 80 });
    await db.sets.update(`${w2.id}-s1`, { durationSec: 0 }); // 0 s: ignored
    expect(await getTimeDistanceRecords('plank')).toEqual({ longestTime: { sec: 90, at: day(1) } });
    expect(await getTimeDistanceRecords('walk')).toEqual({ longestDistance: { m: 40, at: day(1) } });
    // weighted walk has 0 reps: no weight / 1RM records, so the rep records stay empty
    expect(await getExerciseRecords('walk')).toBeNull();
  });

  it('null when only warm-ups or nothing', async () => {
    await workout(day(1), [['bench', 40, 10, true]]);
    expect(await getExerciseRecords('bench')).toBeNull();
    expect(computeRecords([])).toBeNull();
  });

  it('active (unfinished) workouts do not count', async () => {
    await workout(day(1), [['bench', 200, 5]], { endedAt: undefined });
    expect(await getExerciseRecords('bench')).toBeNull();
  });
});

describe('summary reps record', () => {
  it('more reps at a weight done before; not for a new weight', async () => {
    await workout(day(1), [['bench', 30, 10], ['bench', 30, 9]]);
    const w = await workout(day(2), [['bench', 30, 11], ['bench', 32.5, 6]]);
    const recs = (await summarizeWorkout(w.id)).records.filter((r) => r.kind === 'reps');
    expect(recs).toEqual([{ exerciseId: 'bench', kind: 'reps', value: 11, weight: 30, reps: 11 }]);
  });
});

describe('history list and detail', () => {
  it('lists finished and imported workouts newest first, durations only for app workouts', async () => {
    await workout(day(1), [['bench', 30, 10, true], ['bench', 30, 10], ['row', 40, 10]]);
    await workout(day(5), [['bench', 30, 10]], { source: 'import', endedAt: undefined });
    await workout(day(6), [['bench', 30, 10]], { endedAt: undefined }); // active
    const list = await listFinishedWorkouts();
    expect(list.map((i) => i.workout.startedAt)).toEqual([day(5), day(1)]);
    expect(list[1]).toMatchObject({ sets: 2, exercises: 2, durationSec: 3600 });
    expect(list[0].durationSec).toBeUndefined();
    expect([...workoutDays(list, 2026, 10)].sort()).toEqual([1, 5]);
    expect(workoutDays(list, 2026, 9).size).toBe(0);
  });

  it('detail groups sets per exercise; deleteWorkout removes the workout and its sets', async () => {
    const w = await workout(day(1), [['bench', 30, 10], ['bench', 30, 9]]);
    await db.sets.update(`${w.id}-s1`, { exerciseOrder: 1, exerciseId: 'row' });
    const d = (await getWorkoutDetail(w.id))!;
    expect(d.groups.map((g) => [g.exerciseId, g.sets.length])).toEqual([['bench', 1], ['row', 1]]);
    await deleteWorkout(w.id);
    expect(await db.workouts.count()).toBe(0);
    expect(await db.sets.count()).toBe(0);
    expect(await getWorkoutDetail(w.id)).toBeUndefined();
  });
});
