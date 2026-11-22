import type { Exercise, ExerciseAlias } from './types';

// Pure parsing and matching for the old app's CSV export (no Dexie here).
// Header: Date,Workout name,Exercise,Set,Weight,Reps,Distance,Duration,Measurement unit,Notes

export interface ImportRow {
  date: string; // as in the file, e.g. "2025-01-16 17:20:57"
  startedAt: number; // local time
  workoutName: string;
  exercise: string; // trimmed
  set: number;
  weight: number; // kg
  reps: number;
}

export interface ImportWorkout {
  importKey: string;
  name: string;
  startedAt: number;
  rows: ImportRow[];
}

export class ImportFormatError extends Error {}

const LB = 0.45359237;

/** Splits CSV text into records (quotes, escaped quotes, CRLF). */
export function splitCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      out.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); out.push(row); }
  return out.filter((r) => r.some((f) => f.trim() !== ''));
}

function parseDate(text: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(text.trim());
  if (!m) return null;
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)).getTime();
  return Number.isFinite(t) ? t : null;
}

const num = (s: string | undefined) => {
  const t = (s ?? '').trim().replace(',', '.');
  if (t === '') return NaN;
  return Number(t);
};

export function parseCsv(text: string): { rows: ImportRow[]; skipped: number } {
  const records = splitCsv(text);
  const header = (records.shift() ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iDate = col('date');
  const iName = col('workout name');
  const iEx = col('exercise');
  const iSet = col('set');
  const iW = col('weight');
  const iR = col('reps');
  const iUnit = col('measurement unit');
  if ([iDate, iEx, iW, iR].some((i) => i < 0)) {
    throw new ImportFormatError(
      'To nie wygląda na eksport z aplikacji (brak kolumn Date, Exercise, Weight, Reps).',
    );
  }
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const r of records) {
    const date = (r[iDate] ?? '').trim();
    const startedAt = parseDate(date);
    const exercise = (r[iEx] ?? '').trim().replace(/\s+/g, ' ');
    let weight = num(r[iW]);
    const reps = num(r[iR]);
    if (startedAt === null || !exercise || !Number.isFinite(reps) || reps < 0) {
      skipped++;
      continue;
    }
    if (!Number.isFinite(weight) || weight < 0) weight = 0;
    const unit = iUnit >= 0 ? (r[iUnit] ?? '').trim().toLowerCase() : '';
    if (unit === 'lb' || unit === 'lbs') weight = Math.round(weight * LB * 100) / 100;
    const set = num(iSet >= 0 ? r[iSet] : '');
    rows.push({
      date,
      startedAt,
      workoutName: (iName >= 0 ? r[iName] : '')?.trim() || 'Trening',
      exercise,
      set: Number.isFinite(set) ? set : rows.length,
      weight: Math.min(2000, Math.round(weight * 100) / 100),
      reps: Math.min(999, Math.round(reps)),
    });
  }
  return { rows, skipped };
}

export function groupWorkouts(rows: ImportRow[]): ImportWorkout[] {
  const map = new Map<string, ImportWorkout>();
  for (const r of rows) {
    const key = `csv|${r.date}|${r.workoutName}`;
    let w = map.get(key);
    if (!w) {
      w = { importKey: key, name: r.workoutName, startedAt: r.startedAt, rows: [] };
      map.set(key, w);
    }
    w.rows.push(r);
  }
  return [...map.values()].sort((a, b) => a.startedAt - b.startedAt);
}

// ---------- name matching ----------

const SYN: Record<string, string> = {
  curls: 'curl', raises: 'raise', rows: 'row', ups: 'up', extensions: 'extension',
  crushers: 'crusher', squats: 'squat', deadlifts: 'deadlift', presses: 'press',
  flyes: 'fly', flies: 'fly', flye: 'fly', shrugs: 'shrug', dips: 'dip', lunges: 'lunge',
  bicep: 'biceps', tricep: 'triceps', hyperextensions: 'hyperextension', pulldowns: 'pulldown',
  pushdowns: 'pushdown', pullups: 'pullup', chinups: 'chinup', pushups: 'pushup',
  db: 'dumbbell', dumbbells: 'dumbbell', bb: 'barbell', kb: 'kettlebell', thrusts: 'thrust',
  kickbacks: 'kickback', calves: 'calf', crunches: 'crunch',
};
const STOP = new Set(['with', 'the', 'a', 'an', 'on', 'to', 'of', 'and', 'over', 'in']);
// Generic words count half; words that change the movement count double.
const WEAK = new Set(['machine', 'bench']);
const STRONG = new Set([
  'incline', 'decline', 'reverse', 'preacher', 'hammer', 'romanian', 'stiff', 'front',
  'seated', 'standing', 'lying', 'overhead', 'upright', 'close', 'wide', 'smith', 'assisted',
]);

export function normalizeName(name: string): string[] {
  const s = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/\s*-\s*medium grip\s*$/, '')
    .replace(/\b(pull|push|chin)[\s-]+(downs?|ups?)\b/g, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!s) return [];
  return s
    .split(' ')
    .map((t) => SYN[t] ?? t)
    .filter((t) => !STOP.has(t));
}

function weightedDice(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  const w = (t: string) => (WEAK.has(t) ? 0.5 : STRONG.has(t) ? 2 : 1);
  let inter = 0;
  let total = 0;
  for (const t of A) { total += w(t); if (B.has(t)) inter += w(t); }
  for (const t of B) total += w(t);
  return total === 0 ? 0 : (2 * inter) / total;
}

export function matchScore(a: string, b: string): number {
  return weightedDice(normalizeName(a), normalizeName(b));
}

export interface NameMatch {
  sourceName: string;
  exerciseId: string | null;
  score: number;
  how: 'alias' | 'exact' | 'fuzzy' | 'none';
}

/** Minimum score for a fuzzy suggestion. */
export const SUGGEST_MIN = 0.5;
/** From this score a fuzzy suggestion is pre-selected; below it the name defaults to a custom exercise. */
export const PRESELECT_MIN = 0.75;
/** From this score a fuzzy match counts as "dopasowane automatycznie". */
export const AUTO_MIN = 0.85;

export function matchExercises(
  names: string[],
  exercises: Pick<Exercise, 'id' | 'name'>[],
  aliases: ExerciseAlias[],
): NameMatch[] {
  const ids = new Set(exercises.map((e) => e.id));
  const aliasMap = new Map(aliases.filter((a) => ids.has(a.exerciseId)).map((a) => [a.sourceName.toLowerCase(), a.exerciseId]));
  const byName = new Map<string, string>();
  for (const e of exercises) {
    const k = e.name.trim().toLowerCase();
    if (!byName.has(k)) byName.set(k, e.id);
  }
  const tokens = exercises.map((e) => ({ e, t: normalizeName(e.name) }));
  return names.map((sourceName) => {
    const key = sourceName.trim().toLowerCase();
    const alias = aliasMap.get(key);
    if (alias) return { sourceName, exerciseId: alias, score: 1, how: 'alias' };
    const exact = byName.get(key);
    if (exact) return { sourceName, exerciseId: exact, score: 1, how: 'exact' };
    const src = normalizeName(sourceName);
    let best: { id: string; score: number; len: number } | null = null;
    for (const { e, t } of tokens) {
      const score = weightedDice(src, t);
      if (
        !best ||
        score > best.score + 1e-9 ||
        (Math.abs(score - best.score) < 1e-9 && e.name.length < best.len)
      ) {
        best = { id: e.id, score, len: e.name.length };
      }
    }
    if (best && best.score >= SUGGEST_MIN) {
      return { sourceName, exerciseId: best.id, score: Math.round(best.score * 100) / 100, how: 'fuzzy' };
    }
    return { sourceName, exerciseId: null, score: best ? Math.round(best.score * 100) / 100 : 0, how: 'none' };
  });
}
