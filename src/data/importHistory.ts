import { db } from './db';
import { groupWorkouts, matchExercises, parseCsv, type ImportWorkout, type NameMatch } from './csvImport';
import type { Exercise, Workout, WorkoutSet } from './types';

export interface ImportPreview {
  /** Only workouts not imported before. */
  workouts: ImportWorkout[];
  newWorkouts: number;
  existingWorkouts: number;
  /** Sets in the new workouts. */
  sets: number;
  skipped: number;
  /** Every exercise name in the new workouts, most sets first. */
  names: (NameMatch & { sets: number })[];
}

/** 'custom' = create a custom exercise named like the CSV name. */
export type ImportChoice = string | 'custom';

export async function prepareImport(text: string): Promise<ImportPreview> {
  const { rows, skipped } = parseCsv(text);
  const all = groupWorkouts(rows);
  const keys = all.map((w) => w.importKey);
  const existing = new Set(
    (await db.workouts.where('importKey').anyOf(keys).toArray()).map((w) => w.importKey!),
  );
  const workouts = all.filter((w) => !existing.has(w.importKey));
  const counts = new Map<string, number>();
  for (const w of workouts) for (const r of w.rows) counts.set(r.exercise, (counts.get(r.exercise) ?? 0) + 1);
  const names = [...counts.keys()];
  const [exercises, aliases] = await Promise.all([db.exercises.toArray(), db.aliases.toArray()]);
  const matches = matchExercises(names, exercises, aliases)
    .map((m) => ({ ...m, sets: counts.get(m.sourceName)! }))
    .sort((a, b) => b.sets - a.sets);
  return {
    workouts,
    newWorkouts: workouts.length,
    existingWorkouts: all.length - workouts.length,
    sets: workouts.reduce((n, w) => n + w.rows.length, 0),
    skipped,
    names: matches,
  };
}

export async function commitImport(
  preview: ImportPreview,
  choices: Record<string, ImportChoice>,
): Promise<{ workouts: number; sets: number; created: number }> {
  return db.transaction('rw', [db.workouts, db.sets, db.exercises, db.aliases], async () => {
    // Resolve every CSV name to an exercise id; create custom ones once per name (case-insensitive).
    const resolved = new Map<string, string>();
    const createdByName = new Map<string, string>();
    const existingCustom = new Map(
      (await db.exercises.filter((e) => e.custom).toArray()).map((e) => [e.name.trim().toLowerCase(), e.id]),
    );
    let created = 0;
    for (const n of preview.names) {
      const choice = choices[n.sourceName] ?? n.exerciseId ?? 'custom';
      if (choice !== 'custom' && (await db.exercises.get(choice))) {
        resolved.set(n.sourceName, choice);
        continue;
      }
      const key = n.sourceName.trim().toLowerCase();
      let id = createdByName.get(key) ?? existingCustom.get(key);
      if (!id) {
        const ex: Exercise = {
          id: `custom-${crypto.randomUUID()}`,
          name: n.sourceName.trim(),
          primaryMuscles: [],
          secondaryMuscles: [],
          equipment: null,
          category: 'strength',
          instructions: [],
          images: [],
          custom: true,
        };
        await db.exercises.add(ex);
        id = ex.id;
        created++;
      }
      createdByName.set(key, id);
      resolved.set(n.sourceName, id);
    }
    await db.aliases.bulkPut([...resolved].map(([sourceName, exerciseId]) => ({ sourceName, exerciseId })));

    const workouts: Workout[] = [];
    const sets: WorkoutSet[] = [];
    for (const iw of preview.workouts) {
      if (await db.workouts.where('importKey').equals(iw.importKey).count()) continue;
      const workout: Workout = {
        id: crypto.randomUUID(),
        name: iw.name,
        startedAt: iw.startedAt,
        source: 'import',
        importKey: iw.importKey,
      };
      workouts.push(workout);
      // Exercise order = first appearance; names mapped to the same exercise share one block.
      const order = new Map<string, number>();
      const nextSet = new Map<string, number>();
      const rows = iw.rows.map((r, i) => ({ r, i, id: resolved.get(r.exercise)! }));
      for (const { id } of rows) if (!order.has(id)) order.set(id, order.size);
      rows.sort((a, b) => order.get(a.id)! - order.get(b.id)! || a.i - b.i);
      for (const { r, id } of rows) {
        const setOrder = nextSet.get(id) ?? 0;
        nextSet.set(id, setOrder + 1);
        sets.push({
          id: crypto.randomUUID(),
          workoutId: workout.id,
          exerciseId: id,
          exerciseOrder: order.get(id)!,
          setOrder,
          weight: r.weight,
          reps: r.reps,
          warmup: false,
          completedAt: iw.startedAt,
        });
      }
    }
    await db.workouts.bulkAdd(workouts);
    await db.sets.bulkAdd(sets);
    return { workouts: workouts.length, sets: sets.length, created };
  });
}
