import { db } from './db';
import { getSettings, updateSettings } from './settings';
import type { Exercise } from './types';
import tips from './tips-pl.json';
import extra from './exercises-extra.json';
import akaData from './exercise-aka.json';
import measureData from './exercise-measure.json';
import type { Measure } from './types';
import { classifyDelts, deltHeadsOf, type DeltHead, type Delts } from './deltHeads';

// 2: built-in extra exercises (machines, cables, Smith) and other names for matching the import.
// 3: openGym catalogue text (AGPL-3.0): ~4200 more exercises, Polish names.
// 4: duplicates merged (scripts/dedupe-exercises.ts); user data on removed ids moves to the kept exercise.
// 5: exercise measure (time / distance / cardio) from exercise-measure.json; the user's choice is kept.
// 6: deltoid heads (przód / bok / tył) from deltHeads.ts for built-in exercises.
export const EXERCISE_DB_VERSION = 6;

type AkaEntry = { aka?: string[]; similar?: string[]; maybe?: string[] };
const AKA = akaData as Record<string, AkaEntry>;

const MEASURE_BY_ID = new Map<string, Measure>([
  ...measureData.time.map((id): [string, Measure] => [id, 'time']),
  ...measureData.distance.map((id): [string, Measure] => [id, 'distance']),
  ...measureData.timeDistance.map((id): [string, Measure] => [id, 'timeDistance']),
]);

/** Our own exercises missing from free-exercise-db: Polish instructions and tips, no photos. */
export const EXTRA_EXERCISES = extra as (RawExercise & { tips: string[] })[];

export const IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

export function imageUrl(path: string): string {
  return `${IMAGE_BASE}${path}`;
}

export type RawExercise = {
  id: string;
  name: string;
  namePl?: string;
  /** Names of duplicates merged into this exercise (search + import matching). */
  mergedNames?: string[];
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
  const ex: Exercise = {
    id: raw.id,
    name: raw.name,
    primaryMuscles: raw.primaryMuscles,
    secondaryMuscles: raw.secondaryMuscles,
    equipment: raw.equipment ?? null,
    category: raw.category,
    level: raw.level || undefined,
    instructions: raw.instructions,
    images: raw.images,
    custom: false,
    ...(raw.namePl ? { namePl: raw.namePl } : {}),
    ...AKA[raw.name],
  };
  const delts = classifyDelts(ex);
  if (delts) ex.delts = delts;
  const measure = MEASURE_BY_ID.get(raw.id);
  if (measure) ex.measure = measure;
  if (raw.mergedNames?.length) ex.aka = [...new Set([...(ex.aka ?? []), ...raw.mergedNames])];
  return ex;
}

type OgCatalogue = {
  added: Omit<RawExercise, 'force' | 'level' | 'mechanic'>[];
  polishNames: Record<string, string>;
  /** Names of merged duplicates, by the id that was kept: searchable and matched by the import. */
  aliases: Record<string, string[]>;
  /** Removed duplicate id → kept id. */
  merged: Record<string, string>;
};

const loadOg = () =>
  import('./exercises-og.json').then((m) => (m as unknown as { default: OgCatalogue }).default);

/** Built-in exercises: free-exercise-db, our extras, then openGym's (own lazy chunk, loaded only to seed). */
const defaultLoad = async (): Promise<RawExercise[]> => {
  const [base, og] = await Promise.all([
    import('./exercise-db.json').then((m) => (m as { default: RawExercise[] }).default),
    loadOg(),
  ]);
  const withPl = (r: RawExercise): RawExercise =>
    og.polishNames[r.id] ? { ...r, namePl: og.polishNames[r.id] } : r;
  return [
    ...base.map(withPl),
    ...EXTRA_EXERCISES.filter((e) => !og.merged[e.id]).map(({ tips: _tips, ...raw }) => withPl(raw)),
    ...og.added.map((r): RawExercise => ({ ...r, force: null, level: '', mechanic: null })),
  ].map((r) => (og.aliases[r.id] ? { ...r, mergedNames: og.aliases[r.id] } : r));
};

const defaultMerged = async (): Promise<Record<string, string>> => (await loadOg()).merged;

/** Moves everything that points at a removed duplicate to the exercise that was kept. */
export async function remapExercise(from: string, to: string): Promise<void> {
  await db.transaction('rw', [db.exercises, db.sets, db.notes, db.plans, db.workouts, db.aliases], async () => {
    await db.sets.where('exerciseId').equals(from).modify({ exerciseId: to });
    const note = await db.notes.get(from);
    if (note) {
      const kept = await db.notes.get(to);
      await db.notes.put({ ...note, exerciseId: to, text: kept ? `${kept.text}\n${note.text}` : note.text });
      await db.notes.delete(from);
    }
    await db.aliases.filter((a) => a.exerciseId === from).modify({ exerciseId: to });
    await db.plans.toCollection().modify((plan) => {
      for (const day of plan.days) for (const item of day.items) if (item.exerciseId === from) item.exerciseId = to;
    });
    await db.workouts.toCollection().modify((w) => {
      if (!w.exercises?.some((e) => e.exerciseId === from)) return;
      const hasTo = w.exercises.some((e) => e.exerciseId === to);
      // A workout keeps one entry per exercise.
      w.exercises = hasTo
        ? w.exercises.filter((e) => e.exerciseId !== from)
        : w.exercises.map((e) => (e.exerciseId === from ? { ...e, exerciseId: to } : e));
    });
    const old = await db.exercises.get(from);
    if (old && !old.custom) await db.exercises.delete(from);
  });
}

export async function seedExercises(
  load: () => Promise<RawExercise[]> = defaultLoad,
  loadMerged: () => Promise<Record<string, string>> = defaultMerged,
): Promise<void> {
  const settings = await getSettings();
  if (settings.exerciseDbVersion === EXERCISE_DB_VERSION) {
    const hasNonCustom = await db.exercises.filter((e) => !e.custom).first();
    if (hasNonCustom !== undefined) return;
  }

  const raw = await load();
  // Re-seeding keeps what the user set on a built-in exercise (notes and history live elsewhere).
  const existing = new Map((await db.exercises.filter((e) => !e.custom).toArray()).map((e) => [e.id, e]));
  const mapped = raw.map((r) => {
    const ex = fromDb(r);
    const old = existing.get(ex.id);
    if (old?.weightStep !== undefined) ex.weightStep = old.weightStep;
    if (old?.barWeight !== undefined) ex.barWeight = old.barWeight;
    if (old?.measureOverride !== undefined) ex.measureOverride = old.measureOverride;
    return ex;
  });
  await db.exercises.bulkPut(mapped);
  // Duplicates removed since the last version: re-point the user's data, then drop them.
  for (const [from, to] of Object.entries(await loadMerged())) {
    if (existing.has(from) && from !== to) await remapExercise(from, to);
  }
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
    s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/ł/gi, 'l')
      .replace(/[-_]/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  const tokens =
    query !== undefined && query.trim() !== ''
      ? normalize(query).split(' ').filter(Boolean)
      : [];

  return list
    .filter((ex) => {
      if (tokens.length > 0) {
        // English name, Polish name and other names (e.g. "Pec Deck") all count.
        const haystack = normalize([ex.name, ex.namePl ?? '', ...(ex.aka ?? [])].join(' | '));
        // Polish endings vary ("maszyna" / "maszynie"): long words match without their last two letters.
        if (!tokens.every((t) => haystack.includes(t.length > 5 ? t.slice(0, -2) : t))) return false;
      }
      if (muscle != null && muscle.startsWith('shoulders:')) {
        if (!deltHeadsOf(ex, 'any').includes(muscle.slice('shoulders:'.length) as DeltHead)) return false;
      } else if (muscle != null) {
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

const tipsData: Record<string, string[]> = {
  ...(tips as Record<string, string[]>),
  ...Object.fromEntries(EXTRA_EXERCISES.map((e) => [e.id, e.tips])),
};

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
  measure?: Measure;
  /** Chosen deltoid heads (only meaningful when Barki is chosen); none → no `delts`. */
  deltHeads?: DeltHead[];
};

/** `delts` for a custom exercise: heads go to primary when Barki is primary there, else to secondary. */
export function customDelts(input: CustomExerciseInput): Delts | undefined {
  const heads = input.deltHeads ?? [];
  if (heads.length === 0) return undefined;
  if (input.primaryMuscles.includes('shoulders')) return { primary: heads, secondary: [] };
  if (input.secondaryMuscles.includes('shoulders')) return { primary: [], secondary: heads };
  return undefined;
}

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
    ...(input.measure && input.measure !== 'reps' ? { measure: input.measure } : {}),
    ...(customDelts(input) ? { delts: customDelts(input) } : {}),
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
  if (input.measure && input.measure !== 'reps') updated.measure = input.measure;
  else delete updated.measure;
  const delts = customDelts(input);
  if (delts) updated.delts = delts;
  else delete updated.delts;

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

export type InstructionsPl = Record<string, string[]>;

let instructionsPl: Promise<InstructionsPl> | null = null;

/** Polish translations of the database instructions (own lazy chunk, ~0.7 MB). */
export function loadPolishInstructions(): Promise<InstructionsPl> {
  instructionsPl ??= import('./instructions-pl.json').then((m) => m.default as InstructionsPl);
  return instructionsPl;
}

/** Polish steps when a complete translation exists, otherwise the English ones; blank steps dropped. */
export function pickInstructions(exercise: Pick<Exercise, 'id' | 'instructions'>, pl: InstructionsPl | null): string[] {
  const translated = pl?.[exercise.id];
  const steps = translated && translated.length === exercise.instructions.length ? translated : exercise.instructions;
  return steps.filter((step) => step.trim() !== '');
}
