import LZString from 'lz-string';
import { db } from './db';
import { QR_MAX_URL, bad, isStrArray, CORRUPTED, shareUrl } from './planShare';
import type { Exercise } from './types';

export const EXERCISES_ROUTE = '/cwiczenia/import';
export const MAX_SHARED_EXERCISES = 50;
export { QR_MAX_URL };

export interface SharedCustomExercise {
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string | null;
  category: string;
}

/** Type marker 'x' tells it apart from a plan payload (which has no `t`). */
interface Payload {
  v: 1;
  t: 'x';
  x: [string, string[], string[], string | null, string][];
}

export function encodeExercises(exercises: Exercise[]): string {
  if (exercises.length < 1 || exercises.length > MAX_SHARED_EXERCISES) {
    throw new RangeError(`Można wysłać od 1 do ${MAX_SHARED_EXERCISES} ćwiczeń`);
  }
  const payload: Payload = {
    v: 1,
    t: 'x',
    x: exercises.map((e) => [e.name, e.primaryMuscles, e.secondaryMuscles, e.equipment, e.category]),
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
      if (!Array.isArray(raw) || raw.length !== 5) bad();
      const [rawName, primary, secondary, equipment, category] = raw as unknown[];
      if (typeof rawName !== 'string' || !isStrArray(primary) || !isStrArray(secondary)) bad();
      if (equipment !== null && typeof equipment !== 'string') bad();
      if (typeof category !== 'string') bad();
      const name = rawName.trim().slice(0, 100).trim();
      if (!name) bad();
      return {
        name,
        primaryMuscles: clip(primary),
        secondaryMuscles: clip(secondary),
        equipment: equipment === null ? null : equipment.slice(0, 40),
        category: category.slice(0, 40) || 'strength',
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
      });
      added++;
    }
    return { added, skipped };
  });
}
