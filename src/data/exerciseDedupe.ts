import { normalizeName } from './csvImport.ts';

// Finds the same exercise listed twice under slightly different names (pure; used by
// scripts/dedupe-exercises.ts and its tests).

/** Words that only describe the kind of machine/loading, not a different movement. */
const NOISE = new Set(['plate', 'loaded', 'selectorized', 'exercise', 'movement', 'version', 'using', 'at']);

const PHRASES: [RegExp, string][] = [
  [/\bv\.?\s*\d+\b/g, ' '], // openGym's "v. 2" = another write-up of the same exercise
  [/\blever(age)?\b/g, 'machine'],
  [/\bsmith\b(?!\s*machine)/g, 'smith machine'],
  [/\be-?z[\s-]*(curl\s*)?bar(bell)?\b/g, 'ez'],
  [/\b(sit|step|push|pull|chin)[\s-]+ups?\b/g, '$1up'],
  [/\b(pull|push)[\s-]+downs?\b/g, '$1down'],
  [/\bdumbbells?\b/g, 'dumbbell'],
  [/\bone[\s-]+(arm|leg)(ed)?\b/g, 'single $1'],
  [/\bsingle[\s-]+(arm|leg)(ed)?\b/g, 'single $1'],
  [/\bunilateral\b/g, 'single'],
];

/** Normalized word set: lowercase, no punctuation, singular, synonyms unified, order ignored. */
export function dedupeTokens(name: string): string[] {
  let s = name.toLowerCase();
  for (const [re, to] of PHRASES) s = s.replace(re, to);
  const words = normalizeName(s)
    .map((t) => (t.length > 3 && t.endsWith('s') && !/(ss|us|is)$/.test(t) ? t.slice(0, -1) : t))
    .filter((t) => !NOISE.has(t));
  return [...new Set(words)].sort();
}

export interface DedupeEntry {
  id: string;
  name: string;
  equipment: string | null;
  primaryMuscles: string[];
}

export function dedupeKey(e: DedupeEntry): string {
  return `${dedupeTokens(e.name).join(' ')}|${e.equipment ?? ''}|${e.primaryMuscles[0] ?? ''}`;
}

/** Groups of entries whose normalized name, equipment and primary muscle are identical. */
export function exactGroups<T extends DedupeEntry>(list: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const e of list) {
    const k = dedupeKey(e);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Words that repeat what the equipment already says, so adding or dropping one keeps the movement. */
const REDUNDANT: Record<string, string[]> = {
  cable: ['cable'],
  barbell: ['barbell', 'bar', 'olympic'],
  dumbbell: ['dumbbell'],
  machine: ['machine'],
  bands: ['band', 'resistance', 'banded'],
  kettlebells: ['kettlebell'],
  'body only': ['bodyweight', 'body', 'weight'],
  'e-z curl bar': ['ez', 'bar', 'barbell'],
  'exercise ball': ['ball', 'stability', 'swiss'],
  'medicine ball': ['medicine', 'ball'],
};
const ALWAYS_REDUNDANT = new Set(['flat', 'regular', 'standard', 'basic', 'classic', 'full', 'range', 'motion', 'left', 'right']);

/**
 * Near matches for a person to review: same equipment and primary muscle, at least two shared words,
 * and the names differ only by words that repeat the equipment or say nothing about the movement
 * (e.g. "Jefferson Squats" / "Barbell Jefferson Squat", "Band Lying Leg Raise" / "Resistance Band Lying Leg Raise").
 */
export function nearPairs<T extends DedupeEntry>(reps: T[]): [T, T, string][] {
  const byBucket = new Map<string, { e: T; t: string[] }[]>();
  for (const e of reps) {
    const b = `${e.equipment ?? ''}|${e.primaryMuscles[0] ?? ''}`;
    byBucket.set(b, [...(byBucket.get(b) ?? []), { e, t: dedupeTokens(e.name) }]);
  }
  const out: [T, T, string][] = [];
  for (const items of byBucket.values()) {
    const soft = new Set([...ALWAYS_REDUNDANT, ...(REDUNDANT[items[0].e.equipment ?? ''] ?? [])]);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const diff = [...a.t.filter((x) => !b.t.includes(x)), ...b.t.filter((x) => !a.t.includes(x))];
        const shared = a.t.filter((x) => b.t.includes(x)).filter((x) => !soft.has(x)).length;
        if (diff.length > 0 && shared >= 1 && diff.every((w) => soft.has(w))) out.push([a.e, b.e, diff.join(' / ')]);
      }
    }
  }
  return out;
}
