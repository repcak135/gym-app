import { db } from './db';
import { getSettings } from './settings';
import { buildPrefill, epley1RM } from './progression';
import { deloadWeight, setTargets } from './setTargets';
import type { Workout, WorkoutExercise, WorkoutSet } from './types';

// Every function here is one short Dexie transaction, so closing the app at any
// moment of a workout keeps everything the user already entered.

/** A workout that counts as history (imported ones have no endedAt). */
export function isFinished(w: Workout): boolean {
  return w.endedAt !== undefined || w.source === 'import';
}

function byOrder(a: WorkoutSet, b: WorkoutSet): number {
  return a.exerciseOrder - b.exerciseOrder || a.setOrder - b.setOrder;
}

export async function getActiveWorkout(): Promise<Workout | undefined> {
  const open = await db.workouts.filter((w) => w.source === 'app' && w.endedAt === undefined).toArray();
  return open.sort((a, b) => b.startedAt - a.startedAt)[0];
}

export async function getWorkoutSets(workoutId: string): Promise<WorkoutSet[]> {
  return (await db.sets.where('workoutId').equals(workoutId).toArray()).sort(byOrder);
}

/** Finished workouts containing the exercise, newest first, with their completed sets. */
export async function getExerciseHistory(
  exerciseId: string,
  excludeWorkoutId?: string,
): Promise<{ workout: Workout; sets: WorkoutSet[] }[]> {
  const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray();
  const byWorkout = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    if (s.completedAt === undefined || s.workoutId === excludeWorkoutId) continue;
    const list = byWorkout.get(s.workoutId) ?? [];
    list.push(s);
    byWorkout.set(s.workoutId, list);
  }
  const workouts = await db.workouts.bulkGet([...byWorkout.keys()]);
  return workouts
    .filter((w): w is Workout => !!w && isFinished(w))
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((workout) => ({ workout, sets: byWorkout.get(workout.id)!.sort(byOrder) }));
}

export async function getLastSets(exerciseId: string, excludeWorkoutId?: string): Promise<WorkoutSet[]> {
  const history = await getExerciseHistory(exerciseId, excludeWorkoutId);
  return history[0]?.sets ?? [];
}

async function prefilledSets(workoutId: string, ex: WorkoutExercise, exerciseOrder: number): Promise<WorkoutSet[]> {
  const last = await getLastSets(ex.exerciseId, workoutId);
  let values = buildPrefill(last, ex.warmupSets, ex.sets, ex.repsMin);
  // Working sets get a target per set (see setTargets); warm-ups stay as last time.
  const [exercise, settings] = await Promise.all([db.exercises.get(ex.exerciseId), getSettings()]);
  const step = exercise?.weightStep ?? settings.defaultWeightStep;
  const targets = setTargets({
    lastWorking: last.filter((s) => !s.warmup),
    count: ex.sets,
    repsMin: ex.repsMin,
    repsMax: ex.repsMax,
    step,
    effort: settings.effortTarget,
  });
  if (targets.length > 0) {
    let w = 0;
    values = values.map((v) => {
      if (v.warmup) return v;
      const t = targets[w++];
      return t ? { ...v, weight: t.weight, reps: t.reps } : v;
    });
  }
  return values.map((v, i) => ({
    id: crypto.randomUUID(),
    workoutId,
    exerciseId: ex.exerciseId,
    exerciseOrder,
    setOrder: i,
    weight: v.weight,
    reps: v.reps,
    warmup: v.warmup,
  }));
}

export async function startWorkout(opts: { planId?: string; dayId?: string } = {}): Promise<Workout> {
  const active = await getActiveWorkout();
  if (active) return active;

  let name = 'Trening';
  let exercises: WorkoutExercise[] = [];
  if (opts.planId && opts.dayId) {
    const plan = await db.plans.get(opts.planId);
    const day = plan?.days.find((d) => d.id === opts.dayId);
    if (day) {
      name = day.name;
      // Plan items may repeat an exercise; a workout keeps one entry per exercise.
      const seen = new Set<string>();
      exercises = day.items
        .filter((it) => (seen.has(it.exerciseId) ? false : (seen.add(it.exerciseId), true)))
        .map((it) => ({ ...it }));
    }
  }

  const workout: Workout = {
    id: crypto.randomUUID(),
    name,
    startedAt: Date.now(),
    planId: exercises.length || opts.dayId ? opts.planId : undefined,
    dayId: opts.dayId,
    source: 'app',
    exercises,
    currentIndex: 0,
  };
  const sets: WorkoutSet[] = [];
  for (let i = 0; i < exercises.length; i++) sets.push(...(await prefilledSets(workout.id, exercises[i], i)));
  await db.transaction('rw', db.workouts, db.sets, async () => {
    await db.workouts.add(workout);
    await db.sets.bulkAdd(sets);
  });
  return workout;
}

async function mutateWorkout(workoutId: string, fn: (w: Workout) => void): Promise<void> {
  await db.transaction('rw', db.workouts, async () => {
    const w = await db.workouts.get(workoutId);
    if (!w) throw new Error('Nie znaleziono treningu');
    fn(w);
    await db.workouts.put(w);
  });
}

export async function addExercises(workoutId: string, exerciseIds: string[]): Promise<void> {
  const s = await getSettings();
  const w = await db.workouts.get(workoutId);
  if (!w) throw new Error('Nie znaleziono treningu');
  const list = [...(w.exercises ?? [])];
  const newSets: WorkoutSet[] = [];
  for (const exerciseId of exerciseIds) {
    if (list.some((e) => e.exerciseId === exerciseId)) continue;
    const ex: WorkoutExercise = {
      exerciseId,
      warmupSets: s.defaultWarmupSets,
      sets: s.defaultSets,
      repsMin: s.defaultRepsMin,
      repsMax: s.defaultRepsMax,
      restSec: s.defaultRestSec,
    };
    list.push(ex);
    newSets.push(...(await prefilledSets(workoutId, ex, list.length - 1)));
  }
  await db.transaction('rw', db.workouts, db.sets, async () => {
    await mutateWorkout(workoutId, (cur) => {
      cur.exercises = list;
    });
    await db.sets.bulkAdd(newSets);
  });
}

export async function swapExercise(workoutId: string, index: number, newExerciseId: string): Promise<void> {
  const w = await db.workouts.get(workoutId);
  const old = w?.exercises?.[index];
  if (!w || !old) throw new Error('Nie znaleziono ćwiczenia');
  if (w.exercises!.some((e) => e.exerciseId === newExerciseId)) throw new Error('To ćwiczenie już jest w treningu');
  const oldSets = await db.sets.where({ exerciseId: old.exerciseId, workoutId }).toArray();
  if (oldSets.some((s) => s.completedAt !== undefined)) throw new Error('Ćwiczenie ma zaliczone serie');
  const ex: WorkoutExercise = { ...old, exerciseId: newExerciseId };
  const sets = await prefilledSets(workoutId, ex, index);
  await db.transaction('rw', db.workouts, db.sets, async () => {
    await db.sets.bulkDelete(oldSets.map((s) => s.id));
    await db.sets.bulkAdd(sets);
    await mutateWorkout(workoutId, (cur) => {
      cur.exercises![index] = ex;
    });
  });
}

export async function removeExercise(workoutId: string, index: number): Promise<void> {
  await db.transaction('rw', db.workouts, db.sets, async () => {
    const w = await db.workouts.get(workoutId);
    const ex = w?.exercises?.[index];
    if (!w || !ex) throw new Error('Nie znaleziono ćwiczenia');
    await db.sets.where({ exerciseId: ex.exerciseId, workoutId }).delete();
    w.exercises = w.exercises!.filter((_, i) => i !== index);
    w.currentIndex = Math.min(w.currentIndex ?? 0, Math.max(0, w.exercises.length - 1));
    await db.workouts.put(w);
    // Keep exerciseOrder equal to the position in the list.
    const order = new Map(w.exercises.map((e, i) => [e.exerciseId, i]));
    const sets = await db.sets.where('workoutId').equals(workoutId).toArray();
    await db.sets.bulkPut(sets.map((s) => ({ ...s, exerciseOrder: order.get(s.exerciseId) ?? s.exerciseOrder })));
  });
}

/** Moves an exercise within the workout; sets keep their data, currentIndex follows the shown exercise. */
export async function moveExercise(workoutId: string, from: number, to: number): Promise<void> {
  await db.transaction('rw', db.workouts, db.sets, async () => {
    const w = await db.workouts.get(workoutId);
    const list = w?.exercises;
    if (!w || !list) return;
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    const currentId = list[w.currentIndex ?? 0]?.exerciseId;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    if (currentId !== undefined) {
      const ci = list.findIndex((e) => e.exerciseId === currentId);
      if (ci >= 0) w.currentIndex = ci;
    }
    await db.workouts.put(w);
    const order = new Map(list.map((e, i) => [e.exerciseId, i]));
    const sets = await db.sets.where('workoutId').equals(workoutId).toArray();
    await db.sets.bulkPut(sets.map((s) => ({ ...s, exerciseOrder: order.get(s.exerciseId) ?? s.exerciseOrder })));
  });
}

export async function updateSet(
  setId: string,
  patch: Partial<Pick<WorkoutSet, 'weight' | 'reps' | 'warmup'>> & { rir?: number | null },
): Promise<void> {
  const clean: Partial<WorkoutSet> = {};
  // null clears RIR (Dexie removes a property set to undefined).
  if (patch.rir === null) clean.rir = undefined;
  else if (typeof patch.rir === 'number' && Number.isFinite(patch.rir))
    clean.rir = Math.min(5, Math.max(0, Math.round(patch.rir)));
  if (typeof patch.weight === 'number' && Number.isFinite(patch.weight))
    clean.weight = Math.min(2000, Math.max(0, Math.round(patch.weight * 100) / 100));
  if (typeof patch.reps === 'number' && Number.isFinite(patch.reps))
    clean.reps = Math.min(999, Math.max(0, Math.round(patch.reps)));
  if (typeof patch.warmup === 'boolean') clean.warmup = patch.warmup;
  await db.transaction('rw', db.workouts, db.sets, async () => {
    const before = await db.sets.get(setId);
    await db.sets.update(setId, clean);
    if (before && typeof clean.warmup === 'boolean' && clean.warmup !== before.warmup) {
      await adjustCounts(before.workoutId, before.exerciseId, clean.warmup ? -1 : 1, clean.warmup ? 1 : -1);
    }
  });
}

/** Sets suggested weight on all not-yet-done working sets of one exercise. */
export async function applyWeight(workoutId: string, exerciseId: string, weight: number): Promise<void> {
  await db.transaction('rw', db.sets, async () => {
    const sets = await db.sets.where({ exerciseId, workoutId }).toArray();
    await db.sets.bulkPut(
      sets.filter((s) => !s.warmup && s.completedAt === undefined).map((s) => ({ ...s, weight })),
    );
  });
}

/** Lowers the weight (~10%, by step) of all not-yet-done working sets of one exercise. */
export async function scaleWorkingWeights(workoutId: string, exerciseId: string, step: number): Promise<void> {
  await db.transaction('rw', db.sets, async () => {
    const sets = await db.sets.where({ exerciseId, workoutId }).toArray();
    await db.sets.bulkPut(
      sets
        .filter((s) => !s.warmup && s.completedAt === undefined)
        .map((s) => ({ ...s, weight: deloadWeight(s.weight, step) })),
    );
  });
}

export async function addSet(workoutId: string, index: number): Promise<void> {
  await db.transaction('rw', db.workouts, db.sets, async () => {
    const w = await db.workouts.get(workoutId);
    const ex = w?.exercises?.[index];
    if (!ex) throw new Error('Nie znaleziono ćwiczenia');
    const sets = (await db.sets.where({ exerciseId: ex.exerciseId, workoutId }).toArray()).sort(byOrder);
    const last = sets.filter((s) => !s.warmup).at(-1) ?? sets.at(-1);
    await db.sets.add({
      id: crypto.randomUUID(),
      workoutId,
      exerciseId: ex.exerciseId,
      exerciseOrder: index,
      setOrder: (sets.at(-1)?.setOrder ?? -1) + 1,
      weight: last?.weight ?? 0,
      reps: last?.reps ?? ex.repsMin,
      warmup: false,
    });
    // The workout's exercise entry records the intended structure (used to suggest plan changes).
    ex.sets += 1;
    await db.workouts.put(w!);
  });
}

/**
 * Replaces the not-yet-done warm-ups of one exercise with the given ramp. Order becomes:
 * completed warm-ups, new warm-ups, working sets.
 */
export async function replaceWarmups(
  workoutId: string,
  exerciseId: string,
  ramp: { weight: number; reps: number }[],
): Promise<void> {
  await db.transaction('rw', db.workouts, db.sets, async () => {
    const w = await db.workouts.get(workoutId);
    const index = w?.exercises?.findIndex((e) => e.exerciseId === exerciseId) ?? -1;
    if (!w || index < 0) throw new Error('Nie znaleziono ćwiczenia');
    const sets = (await db.sets.where({ exerciseId, workoutId }).toArray()).sort(byOrder);
    const stale = sets.filter((s) => s.warmup && s.completedAt === undefined);
    const doneWarmups = sets.filter((s) => s.warmup && s.completedAt !== undefined);
    const working = sets.filter((s) => !s.warmup);
    await db.sets.bulkDelete(stale.map((s) => s.id));
    const fresh: WorkoutSet[] = ramp.map((r) => ({
      id: crypto.randomUUID(),
      workoutId,
      exerciseId,
      exerciseOrder: index,
      setOrder: 0,
      weight: r.weight,
      reps: r.reps,
      warmup: true,
    }));
    const ordered = [...doneWarmups, ...fresh, ...working];
    await db.sets.bulkPut(ordered.map((s, i) => ({ ...s, setOrder: i })));
    w.exercises![index].warmupSets = doneWarmups.length + ramp.length;
    await db.workouts.put(w);
  });
}

/** Keeps WorkoutExercise.sets / warmupSets equal to the sets the user chose to keep. */
async function adjustCounts(workoutId: string, exerciseId: string, dWorking: number, dWarmup: number): Promise<void> {
  const w = await db.workouts.get(workoutId);
  const ex = w?.exercises?.find((e) => e.exerciseId === exerciseId);
  if (!w || !ex) return;
  ex.sets = Math.max(0, ex.sets + dWorking);
  ex.warmupSets = Math.max(0, ex.warmupSets + dWarmup);
  await db.workouts.put(w);
}

export async function removeSet(setId: string): Promise<void> {
  await db.transaction('rw', db.workouts, db.sets, async () => {
    const set = await db.sets.get(setId);
    if (!set) return;
    await db.sets.delete(setId);
    await adjustCounts(set.workoutId, set.exerciseId, set.warmup ? 0 : -1, set.warmup ? -1 : 0);
  });
}

export async function completeSet(setId: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.workouts, db.sets, async () => {
    const set = await db.sets.get(setId);
    if (!set) throw new Error('Nie znaleziono serii');
    await db.sets.update(setId, { completedAt: now });
    const w = await db.workouts.get(set.workoutId);
    if (!w) return;
    const ex = w.exercises?.find((e) => e.exerciseId === set.exerciseId);
    const rest = ex?.restSec ?? (await getSettings()).defaultRestSec;
    if (rest > 0) {
      w.restEndsAt = now + rest * 1000;
      w.restTotalSec = rest;
    } else {
      w.restEndsAt = undefined;
      w.restTotalSec = undefined;
    }
    await db.workouts.put(w);
  });
}

export async function uncompleteSet(setId: string): Promise<void> {
  await db.transaction('rw', db.sets, async () => {
    const set = await db.sets.get(setId);
    if (!set) return;
    delete set.completedAt;
    await db.sets.put(set);
  });
}

export async function setCurrentIndex(workoutId: string, index: number): Promise<void> {
  await mutateWorkout(workoutId, (w) => {
    w.currentIndex = Math.max(0, Math.min(index, (w.exercises?.length ?? 1) - 1));
  });
}

export async function skipRest(workoutId: string): Promise<void> {
  await mutateWorkout(workoutId, (w) => {
    w.restEndsAt = undefined;
    w.restTotalSec = undefined;
  });
}

export async function extendRest(workoutId: string, sec: number, now = Date.now()): Promise<void> {
  await mutateWorkout(workoutId, (w) => {
    const base = Math.max(w.restEndsAt ?? now, now);
    w.restEndsAt = base + sec * 1000;
    w.restTotalSec = (w.restTotalSec ?? 0) + sec;
  });
}

/** 'empty' = nothing was completed; the workout is left untouched for the UI to offer discarding. */
export async function finishWorkout(workoutId: string, now = Date.now()): Promise<'finished' | 'empty'> {
  return db.transaction('rw', db.workouts, db.sets, async () => {
    const w = await db.workouts.get(workoutId);
    if (!w) throw new Error('Nie znaleziono treningu');
    const sets = await db.sets.where('workoutId').equals(workoutId).toArray();
    if (!sets.some((s) => s.completedAt !== undefined)) return 'empty';
    await db.sets.bulkDelete(sets.filter((s) => s.completedAt === undefined).map((s) => s.id));
    w.endedAt = now;
    w.restEndsAt = undefined;
    w.restTotalSec = undefined;
    await db.workouts.put(w);
    return 'finished';
  });
}

export async function discardWorkout(workoutId: string): Promise<void> {
  await db.transaction('rw', db.workouts, db.sets, async () => {
    await db.sets.where('workoutId').equals(workoutId).delete();
    await db.workouts.delete(workoutId);
  });
}

export type RecordKind = 'weight' | 'e1rm' | 'volume' | 'reps';
export interface NewRecord {
  exerciseId: string;
  kind: RecordKind;
  value: number;
  /** For 'reps': more reps than ever at this weight (a weight done before). */
  weight?: number;
  reps?: number;
}
export interface WorkoutSummary {
  durationSec: number;
  sets: number;
  volume: number;
  records: NewRecord[];
}

function bests(sets: WorkoutSet[]): Record<Exclude<RecordKind, 'reps'>, number> {
  const working = sets.filter((s) => !s.warmup && s.completedAt !== undefined);
  return {
    weight: Math.max(0, ...working.filter((s) => s.reps > 0).map((s) => s.weight)),
    e1rm: Math.max(0, ...working.map((s) => epley1RM(s.weight, s.reps))),
    volume: working.reduce((sum, s) => sum + s.weight * s.reps, 0),
  };
}

/**
 * New records of one exercise in one workout against its earlier workouts (each an array of sets).
 * An exercise's first workout never counts (everything would be a "record").
 */
export function findNewRecords(exerciseId: string, nowSets: WorkoutSet[], earlier: WorkoutSet[][]): NewRecord[] {
  if (earlier.length === 0) return [];
  const records: NewRecord[] = [];
  const working = nowSets.filter((s) => !s.warmup && s.completedAt !== undefined);
  const now = bests(working);
  const before = { weight: 0, e1rm: 0, volume: 0 };
  for (const sets of earlier) {
    const b = bests(sets);
    before.weight = Math.max(before.weight, b.weight);
    before.e1rm = Math.max(before.e1rm, b.e1rm);
    before.volume = Math.max(before.volume, b.volume);
  }
  for (const kind of ['weight', 'e1rm', 'volume'] as const) {
    if (now[kind] > before[kind]) records.push({ exerciseId, kind, value: Math.round(now[kind] * 10) / 10 });
  }
  // Most reps at a weight: best new set beating the old best at that same weight.
  const bestReps = new Map<number, number>();
  for (const sets of earlier) {
    for (const s of sets) {
      if (s.warmup || s.completedAt === undefined || s.reps <= 0) continue;
      bestReps.set(s.weight, Math.max(bestReps.get(s.weight) ?? 0, s.reps));
    }
  }
  let repsRecord: { weight: number; reps: number } | null = null;
  for (const s of working) {
    const prev = bestReps.get(s.weight);
    if (prev === undefined || s.reps <= prev) continue;
    if (!repsRecord || s.weight > repsRecord.weight || (s.weight === repsRecord.weight && s.reps > repsRecord.reps)) {
      repsRecord = { weight: s.weight, reps: s.reps };
    }
  }
  if (repsRecord) records.push({ exerciseId, kind: 'reps', value: repsRecord.reps, ...repsRecord });
  return records;
}

export async function summarizeWorkout(workoutId: string): Promise<WorkoutSummary> {
  const w = await db.workouts.get(workoutId);
  if (!w) throw new Error('Nie znaleziono treningu');
  const sets = (await getWorkoutSets(workoutId)).filter((s) => s.completedAt !== undefined);
  const working = sets.filter((s) => !s.warmup);
  const records: NewRecord[] = [];
  const exerciseIds = [...new Set(working.map((s) => s.exerciseId))];
  for (const exerciseId of exerciseIds) {
    const earlier = (await getExerciseHistory(exerciseId, workoutId)).filter((h) => h.workout.startedAt < w.startedAt);
    records.push(...findNewRecords(exerciseId, working.filter((s) => s.exerciseId === exerciseId), earlier.map((h) => h.sets)));
  }
  return {
    durationSec: Math.max(0, Math.round(((w.endedAt ?? Date.now()) - w.startedAt) / 1000)),
    sets: working.length,
    volume: Math.round(working.reduce((sum, s) => sum + s.weight * s.reps, 0) * 10) / 10,
    records,
  };
}
