import LZString from 'lz-string';
import { db } from './db';
import { QR_MAX_URL, bad, isStrArray, CORRUPTED, shareUrl } from './planShare';
import type { Exercise, Measure } from './types';
import type { DeltHead, Delts } from './deltHeads';

const MEASURES: Measure[] = ['reps', 'time', 'distance', 'timeDistance'];
const HEADS: DeltHead[] = ['front', 'side', 'rear'];

export const EXERCISES_ROUTE = '/cwiczenia/import';
export const MAX_SHARED_EXERCISES = 50;
export { QR_MAX_URL };

export interface SharedCustomExercise {
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string | null;
  category: string;
  measure?: Measure;
  delts?: Delts;
}

/** Type marker 'x' tells it apart from a plan payload (which has no `t`). */
interface Payload {
  v: 1;
  t: 'x';
  /** The 6th item (measure) is omitted for rep exercises, the 7th (delts) when there are none, so old readers and links still work. */
  x: ([string, string[], string[], string | null, string] | [string, string[], string[], string | null, string, Measure] | [string, string[], string[], string | null, string, Measure, Delts])[];
}

const parseHeads = (v: unknown): DeltHead[] =>
  Array.isArray(v) ? [...new Set(v.filter((h): h is DeltHead => HEADS.includes(h as DeltHead)))] : [];

/** Optional heads of a shared custom exercise; garbage or empty = none. */
function parseDelts(raw: unknown): Delts | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const primary = parseHeads(o.primary);
  const secondary = parseHeads(o.secondary).filter((h) => !primary.includes(h));
  return primary.length + secondary.length > 0 ? { primary, secondary } : undefined;
}

export function encodeExercises(exercises: Exercise[]): string {
  if (exercises.length < 1 || exercises.length > MAX_SHARED_EXERCISES) {
    throw new RangeError(`Można wysłać od 1 do ${MAX_SHARED_EXERCISES} ćwiczeń`);
  }
  const payload: Payload = {
    v: 1,
    t: 'x',
    x: exercises.map((e) => {
      const base: [string, string[], string[], string | null, string] = [e.name, e.primaryMuscles, e.secondaryMuscles, e.equipment, e.category];
      const measure = e.measureOverride ?? e.measure;
      // Only custom exercises carry their heads in a link (built-in ones are classified from the catalogue).
      if (e.custom && e.delts) return [...base, measure ?? 'reps', e.delts];
      return measure && measure !== 'reps' ? [...base, measure] : base;
    }),
  };
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeExercises(data: string): SharedCustomExercise[] {
  try {
    const json = LZString.decompressFromEncodedURIComponent(data);
    if (!json) bad();
    const p: unknown = JSON.parse(json);
    if (typeof p !== 'object' || p === null || Array.isArray(p)) bad();
    const o = p as Record<string, unknown>;
    if (o.v !== 1 || o.t !== 'x' || !Array.isArray(o.x)) bad();
    if (o.x.length < 1 || o.x.length > MAX_SHARED_EXERCISES) bad();
    const clip = (a: string[]) => a.slice(0, 10).map((s) => s.slice(0, 40));
    return o.x.map((raw: unknown) => {
      if (!Array.isArray(raw) || (raw.length < 5 || raw.length > 7)) bad();
      const [rawName, primary, secondary, equipment, category, rawMeasure, rawDelts] = raw as unknown[];
      if (typeof rawName !== 'string' || !isStrArray(primary) || !isStrArray(secondary)) bad();
      if (equipment !== null && typeof equipment !== 'string') bad();
      if (typeof category !== 'string') bad();
      const name = rawName.trim().slice(0, 100).trim();
      if (!name) bad();
      const delts = parseDelts(rawDelts);
      return {
        name,
        primaryMuscles: clip(primary),
        secondaryMuscles: clip(secondary),
        equipment: equipment === null ? null : equipment.slice(0, 40),
        category: category.slice(0, 40) || 'strength',
        ...(typeof rawMeasure === 'string' && MEASURES.includes(rawMeasure as Measure) && rawMeasure !== 'reps'
          ? { measure: rawMeasure as Measure }
          : {}),
        ...(delts ? { delts } : {}),
      };
    });
  } catch {
    throw new Error(CORRUPTED);
  }
}

export function exercisesShareUrl(data: string, base?: string): string {
  return shareUrl(data, base, EXERCISES_ROUTE);
}

const norm = (s: string) => s.trim().toLowerCase();

/** Names of the shared exercises the user already has as custom ones (case-insensitive). */
export async function existingCustomNames(items: SharedCustomExercise[]): Promise<Set<string>> {
  const have = new Set((await db.exercises.filter((e) => e.custom).toArray()).map((e) => norm(e.name)));
  return new Set(items.map((i) => norm(i.name)).filter((n) => have.has(n)));
}

export async function importSharedExercises(
  items: SharedCustomExercise[],
): Promise<{ added: number; skipped: number }> {
  return db.transaction('rw', db.exercises, async () => {
    const have = new Set((await db.exercises.filter((e) => e.custom).toArray()).map((e) => norm(e.name)));
    let added = 0;
    let skipped = 0;
    for (const it of items) {
      const key = norm(it.name);
      if (have.has(key)) {
        skipped++;
        continue;
      }
      have.add(key);
      await db.exercises.add({
        id: `custom-${crypto.randomUUID()}`,
        name: it.name,
        primaryMuscles: [...it.primaryMuscles],
        secondaryMuscles: [...it.secondaryMuscles],
        equipment: it.equipment,
        category: it.category,
        instructions: [],
        images: [],
        custom: true,
        ...(it.measure ? { measure: it.measure } : {}),
        ...(it.delts ? { delts: it.delts } : {}),
      });
      added++;
    }
    return { added, skipped };
  });
}
