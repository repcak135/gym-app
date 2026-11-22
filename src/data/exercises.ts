import { db } from './db';
import { getSettings, updateSettings } from './settings';
import type { Exercise } from './types';
import tips from './tips-pl.json';

export const EXERCISE_DB_VERSION = 1;

export const IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

export function imageUrl(path: string): string {
  return `${IMAGE_BASE}${path}`;
}

export type RawExercise = {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
};

export function fromDb(raw: RawExercise): Exercise {
  return {
    id: raw.id,
    name: raw.name,
    primaryMuscles: raw.primaryMuscles,
    secondaryMuscles: raw.secondaryMuscles,
    equipment: raw.equipment ?? null,
    category: raw.category,
    level: raw.level,
    instructions: raw.instructions,
    images: raw.images,
    custom: false,
  };
}

const defaultLoad = async (): Promise<RawExercise[]> =>
  ((await import('./exercise-db.json')) as { default: RawExercise[] }).default;

export async function seedExercises(
  load: () => Promise<RawExercise[]> = defaultLoad,
): Promise<void> {
  const settings = await getSettings();
  if (settings.exerciseDbVersion === EXERCISE_DB_VERSION) {
    const hasNonCustom = await db.exercises.filter((e) => !e.custom).first();
    if (hasNonCustom !== undefined) return;
  }

  const raw = await load();
  const mapped = raw.map(fromDb);
  await db.exercises.bulkPut(mapped);
  await updateSettings({ exerciseDbVersion: EXERCISE_DB_VERSION });
}

export type ExerciseFilter = {
  query?: string;
  muscle?: string | null;
  equipment?: string | null;
};

export function filterExercises(
  list: Exercise[],
  f: ExerciseFilter,
): Exercise[] {
  const { query, muscle, equipment } = f;

  // Normalize a string: replace hyphens/underscores with spaces, lowercase, collapse whitespace
  const normalize = (s: string) =>
    s.replace(/[-_]/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();

  const tokens =
    query !== undefined && query.trim() !== ''
      ? normalize(query).split(' ').filter(Boolean)
      : [];

  return list
    .filter((ex) => {
      if (tokens.length > 0) {
        const normalizedName = normalize(ex.name);
        if (!tokens.every((t) => normalizedName.includes(t))) return false;
      }
      if (muscle != null) {
        if (
          !ex.primaryMuscles.includes(muscle) &&
          !ex.secondaryMuscles.includes(muscle)
        )
          return false;
      }
      if (equipment != null) {
        if (ex.equipment !== equipment) return false;
      }
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getRecentExerciseIds(limit = 8): Promise<string[]> {
  const workouts = await db.workouts
    .orderBy('startedAt')
    .reverse()
    .toArray();

  const seen = new Set<string>();
  const result: string[] = [];

  for (const workout of workouts) {
    if (result.length >= limit) break;
    const sets = await db.sets
      .where('workoutId')
      .equals(workout.id)
      .toArray();

    // Sort sets by exerciseOrder to preserve appearance order
    sets.sort((a, b) => a.exerciseOrder - b.exerciseOrder);

    for (const set of sets) {
      if (result.length >= limit) break;
      if (!seen.has(set.exerciseId)) {
        seen.add(set.exerciseId);
        result.push(set.exerciseId);
      }
    }
  }

  return result;
}

const tipsData = tips as Record<string, string[]>;

export function getTips(id: string): string[] {
  return tipsData[id] ?? [];
}

export async function saveNote(exerciseId: string, text: string): Promise<void> {
  // Store the text as typed (the textarea is saved while typing); only a blank note is removed.
  if (text.trim() === '') {
    await db.notes.delete(exerciseId);
  } else {
    await db.notes.put({ exerciseId, text, updatedAt: Date.now() });
  }
}

export type CustomExerciseInput = {
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string | null;
};

export async function createCustomExercise(
  input: CustomExerciseInput,
): Promise<Exercise> {
  if (input.name.trim() === '') throw new Error('Podaj nazwę');
  if (input.primaryMuscles.length === 0)
    throw new Error('Wybierz co najmniej jeden mięsień');

  const exercise: Exercise = {
    id: `custom-${crypto.randomUUID()}`,
    name: input.name.trim(),
    primaryMuscles: input.primaryMuscles,
    secondaryMuscles: input.secondaryMuscles,
    equipment: input.equipment,
    category: 'strength',
    instructions: [],
    images: [],
    custom: true,
  };

  await db.exercises.put(exercise);
  return exercise;
}

export async function updateCustomExercise(
  id: string,
  input: CustomExerciseInput,
): Promise<void> {
  const existing = await db.exercises.get(id);
  if (!existing?.custom) throw new Error('Ćwiczenie nie jest własne');
  if (input.name.trim() === '') throw new Error('Podaj nazwę');
  if (input.primaryMuscles.length === 0)
    throw new Error('Wybierz co najmniej jeden mięsień');

  const updated: Exercise = {
    ...existing,
    name: input.name.trim(),
    primaryMuscles: input.primaryMuscles,
    secondaryMuscles: input.secondaryMuscles,
    equipment: input.equipment,
  };

  await db.exercises.put(updated);
}

export async function deleteCustomExercise(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Check sets
  const setCount = await db.sets.where('exerciseId').equals(id).count();
  if (setCount > 0) {
    return {
      ok: false,
      reason: 'Ćwiczenie jest używane w planie lub historii treningów.',
    };
  }

  // Check plans
  const plans = await db.plans.toArray();
  for (const plan of plans) {
    for (const day of plan.days) {
      for (const item of day.items) {
        if (item.exerciseId === id) {
          return {
            ok: false,
            reason: 'Ćwiczenie jest używane w planie lub historii treningów.',
          };
        }
      }
    }
  }

  // Safe to delete exercise + its note
  await db.transaction('rw', db.exercises, db.notes, async () => {
    await db.exercises.delete(id);
    await db.notes.delete(id);
  });

  return { ok: true };
}
