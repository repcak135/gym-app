import { db } from './db';
import { getSettings, updateSettings } from './settings';
import type { Exercise } from './types';
import tips from './tips-pl.json';
import extra from './exercises-extra.json';
import akaData from './exercise-aka.json';
import measureData from './exercise-measure.json';
import type { Measure } from './types';
import { SLANG } from './slang';
import { classifyDelts, deltHeadsOf, type DeltHead, type Delts } from './deltHeads';
import mergedData from './exercise-merged.json';
import { readBaseline, writeBaseline } from '../cloud/stats';

// 2: built-in extra exercises (machines, cables, Smith) and other names for matching the import.
// 3: openGym catalogue text (AGPL-3.0): ~4200 more exercises, Polish names.
// 4: duplicates merged (scripts/dedupe-exercises.ts); user data on removed ids moves to the kept exercise.
// 5: exercise measure (time / distance / cardio) from exercise-measure.json; the user's choice is kept.
// 6: deltoid heads (przód / bok / tył) from deltHeads.ts for built-in exercises.
// 9: second duplicate review (scripts/merge-exercises.ts, 165 more merged); the map moved to exercise-merged.json.
export const EXERCISE_DB_VERSION = 9;

/** Removed duplicate id → kept id (old ids keep working: upgrade, old backups, old share links, import aliases). */
export const MERGED_EXERCISES = mergedData as Record<string, string>;

/** The id an exercise lives under now (a merged duplicate's id gives the kept exercise). */
export function canonicalExerciseId(id: string): string {
  return MERGED_EXERCISES[id] ?? id;
}

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
    ...AKA[raw.name],
  };
  const delts = classifyDelts(ex);
  if (delts) ex.delts = delts;
  const measure = MEASURE_BY_ID.get(raw.id);
  if (measure) ex.measure = measure;
  if (raw.mergedNames?.length) ex.aka = [...new Set([...(ex.aka ?? []), ...raw.mergedNames])];
  // Polish name first (since 0.9.9). Done last: delts/measure/aka above key on the English name.
  if (raw.namePl) {
    ex.nameEn = raw.name;
    ex.name = raw.namePl;
  }
  return ex;
}

type OgCatalogue = {
  added: Omit<RawExercise, 'force' | 'level' | 'mechanic'>[];
  polishNames: Record<string, string>;
  /** Names of merged duplicates, by the id that was kept: searchable and matched by the import. */
  aliases: Record<string, string[]>;
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
    ...base.filter((e) => !MERGED_EXERCISES[e.id]).map(withPl),
    ...EXTRA_EXERCISES.filter((e) => !MERGED_EXERCISES[e.id]).map(({ tips: _tips, ...raw }) => withPl(raw)),
    ...og.added.map((r): RawExercise => ({ ...r, force: null, level: '', mechanic: null })),
  ].map((r) => (og.aliases[r.id] ? { ...r, mergedNames: og.aliases[r.id] } : r));
};

const defaultMerged = async (): Promise<Record<string, string>> => MERGED_EXERCISES;

/** Moves everything that points at a removed duplicate to the exercise that was kept. */
export async function remapExercise(from: string, to: string): Promise<void> {
  await db.transaction('rw', [db.exercises, db.sets, db.notes, db.plans, db.workouts, db.aliases], async () => {
    // A workout that had both: the moved sets go after the kept exercise's sets, in its place on the list.
    const moved = await db.sets.where('exerciseId').equals(from).toArray();
    const byWorkout = new Map<string, { order: number; maxSet: number }>();
    for (const wid of new Set(moved.map((s) => s.workoutId))) {
      const kept = await db.sets.where('workoutId').equals(wid).filter((s) => s.exerciseId === to).toArray();
      if (kept.length) byWorkout.set(wid, { order: kept[0].exerciseOrder, maxSet: Math.max(...kept.map((s) => s.setOrder)) });
    }
    await db.sets.bulkPut(moved.map((s) => {
      const k = byWorkout.get(s.workoutId);
      return k ? { ...s, exerciseId: to, exerciseOrder: k.order, setOrder: k.maxSet + 1 + s.setOrder } : { ...s, exerciseId: to };
    }));
    const note = await db.notes.get(from);
    if (note) {
      const kept = await db.notes.get(to);
      await db.notes.put({ ...note, exerciseId: to, text: kept ? `${kept.text}
${note.text}` : note.text });
      await db.notes.delete(from);
    }
    await db.aliases.filter((a) => a.exerciseId === from).modify({ exerciseId: to });
    await db.plans.toCollection().modify((plan) => {
      for (const day of plan.days) {
        if (!day.items.some((i) => i.exerciseId === from)) continue;
        // A plan day keeps one item per exercise (the first one).
        const hasTo = day.items.some((i) => i.exerciseId === to);
        day.items = hasTo
          ? day.items.filter((i) => i.exerciseId !== from)
          : day.items.map((i) => (i.exerciseId === from ? { ...i, exerciseId: to } : i));
      }
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
    if (old && !old.custom) {
      // The user's settings on the removed exercise move over when the kept one has none.
      const keep = await db.exercises.get(to);
      if (keep) {
        const patch: Partial<Exercise> = {};
        if (old.weightStep !== undefined && keep.weightStep === undefined) patch.weightStep = old.weightStep;
        if (old.barWeight !== undefined && keep.barWeight === undefined) patch.barWeight = old.barWeight;
        if (old.measureOverride !== undefined && keep.measureOverride === undefined) patch.measureOverride = old.measureOverride;
        if (old.userNames?.length) patch.userNames = [...new Set([...(keep.userNames ?? []), ...old.userNames])];
        if (Object.keys(patch).length) await db.exercises.update(to, patch);
      }
      await db.exercises.delete(from);
    }
  });
  // Anonymous stats count per id: carry the already-sent count so nothing is sent twice.
  const base = readBaseline();
  if (base[from] !== undefined) {
    base[to] = (base[to] ?? 0) + base[from];
    delete base[from];
    writeBaseline(base);
  }
}

/** Ids of removed duplicates that the user's data still points at (built-in rows, history, plans, notes, aliases). */
async function referencedMergedIds(merged: Record<string, string>): Promise<string[]> {
  const ids = new Set<string>();
  const add = (id: string) => { if (merged[id] && merged[id] !== id) ids.add(id); };
  (await db.exercises.toCollection().primaryKeys()).forEach((k) => add(String(k)));
  (await db.sets.orderBy('exerciseId').uniqueKeys()).forEach((k) => add(String(k)));
  (await db.notes.toCollection().primaryKeys()).forEach((k) => add(String(k)));
  (await db.aliases.toArray()).forEach((a) => add(a.exerciseId));
  (await db.plans.toArray()).forEach((p) => p.days.forEach((d) => d.items.forEach((i) => add(i.exerciseId))));
  (await db.workouts.toArray()).forEach((w) => w.exercises?.forEach((e) => add(e.exerciseId)));
  return [...ids];
}

/** Re-points every reference to a merged duplicate (catalogue upgrade, restoring an old backup). */
export async function remapMergedExercises(merged: Record<string, string> = MERGED_EXERCISES): Promise<number> {
  const ids = await referencedMergedIds(merged);
  for (const from of ids) await remapExercise(from, merged[from]);
  return ids.length;
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
    if (old?.userNames?.length) ex.userNames = old.userNames;
    return ex;
  });
  await db.exercises.bulkPut(mapped);
  // Duplicates removed since the last version: re-point the user's data, then drop them.
  await remapMergedExercises(await loadMerged());
  await updateSettings({ exerciseDbVersion: EXERCISE_DB_VERSION });
}

export type ExerciseFilter = {
  query?: string;
  muscle?: string | null;
  equipment?: string | null;
};

/** Lowercase, no Polish diacritics, hyphens/underscores as spaces, single spaces. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/gi, 'l')
    .replace(/[-_]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Other names a person may search by: the user's own first, then built-in gym slang. */
export function searchNames(ex: Pick<Exercise, 'id' | 'userNames'>): string[] {
  return [...(ex.userNames ?? []), ...(SLANG[ex.id] ?? [])];
}

const queryTokens = (query: string | undefined) =>
  query !== undefined && query.trim() !== '' ? normalizeName(query).split(' ').filter(Boolean) : [];

// Polish endings vary ("maszyna" / "maszynie"): long words match without their last two letters.
const matches = (haystack: string, tokens: string[]) =>
  tokens.every((t) => haystack.includes(t.length > 5 ? t.slice(0, -2) : t));

/**
 * The slang / user name that matched the query, when the exercise's own names did not
 * (shown under the name in results), else null.
 */
export function matchedAlias(ex: Exercise, query: string | undefined): string | null {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return null;
  if (matches(normalizeName([ex.name, ex.nameEn ?? '', ...(ex.aka ?? [])].join(' | ')), tokens)) return null;
  return searchNames(ex).find((n) => matches(normalizeName(n), tokens)) ?? null;
}

export function filterExercises(
  list: Exercise[],
  f: ExerciseFilter,
): Exercise[] {
  const { query, muscle, equipment } = f;
  const tokens = queryTokens(query);
  const whole = tokens.join(' ');
  // Exercises found by a slang / user name come first ("allahy" → Cable Crunch on top),
  // an exact slang name ("francuz") before a longer one ("francuz stojąc").
  const aliasRank = new Map<string, number>();

  return list
    .filter((ex) => {
      if (tokens.length > 0) {
        // Polish name, English name, other names (e.g. "Pec Deck"), slang and the user's names all count.
        const own = matches(normalizeName([ex.name, ex.nameEn ?? '', ...(ex.aka ?? [])].join(' | ')), tokens);
        const alt = searchNames(ex).map(normalizeName).filter((n) => matches(n, tokens));
        if (!own && alt.length === 0) return false;
        if (alt.length > 0) aliasRank.set(ex.id, alt.includes(whole) ? 2 : 1);
        // Own names (Polish or English) that equal / start with the query go first:
        // "leg press" → "Wypychanie nóg na suwnicy" (Leg Press) before "Sled Side Leg Press".
        const names = [ex.name, ex.nameEn ?? '', ...(ex.aka ?? [])].map(normalizeName);
        if (names.includes(whole)) aliasRank.set(ex.id, 3);
        else if (!aliasRank.has(ex.id) && names.some((n) => n.startsWith(whole))) aliasRank.set(ex.id, 1.5);
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
    .sort((a, b) => (aliasRank.get(b.id) ?? 0) - (aliasRank.get(a.id) ?? 0) || a.name.localeCompare(b.name));
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

/** Saves the user's other names for an exercise (trimmed, no duplicates); none → the field is removed. */
export async function setUserNames(id: string, names: string[]): Promise<void> {
  const seen = new Set<string>();
  const clean = names
    .map((n) => n.trim().replace(/\s+/g, ' '))
    .filter((n) => n !== '' && !seen.has(n.toLowerCase()) && !!seen.add(n.toLowerCase()));
  await db.exercises.where('id').equals(id).modify((e) => {
    if (clean.length > 0) e.userNames = clean;
    else delete e.userNames;
  });
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
