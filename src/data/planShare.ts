import LZString from 'lz-string';
import { db } from './db';
import { getSettings, updateSettings } from './settings';
import type { Exercise, Plan, PlanItem } from './types';

export const SHARE_ROUTE = '/plan';
export const QR_MAX_URL = 1800;

const CORRUPTED = 'Link jest uszkodzony';

type PayloadItem = [number, number, number, number, number, number];
type PayloadExercise = [string, string] | [string, string, string[], string[], string | null];
interface Payload {
  v: 1;
  n: string;
  d: [string, PayloadItem[]][];
  e: PayloadExercise[];
}

export interface SharedExercise {
  id: string;
  name: string;
  custom: boolean;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string | null;
}

export type SharedPlan = {
  name: string;
  days: { name: string; items: (Omit<PlanItem, 'exerciseId'> & { exercise: SharedExercise })[] }[];
  exercises: SharedExercise[];
};

export function encodePlan(plan: Plan, exercises: Map<string, Exercise>): string {
  const e: PayloadExercise[] = [];
  const indexOf = new Map<string, number>();
  const d: [string, PayloadItem[]][] = plan.days.map((day) => [
    day.name,
    day.items.map((it) => {
      let idx = indexOf.get(it.exerciseId);
      if (idx === undefined) {
        const ex = exercises.get(it.exerciseId);
        const name = ex?.name ?? it.exerciseId;
        idx = e.length;
        indexOf.set(it.exerciseId, idx);
        e.push(
          ex?.custom
            ? [ex.id, name, ex.primaryMuscles, ex.secondaryMuscles, ex.equipment]
            : [it.exerciseId, name],
        );
      }
      return [idx, it.sets, it.warmupSets, it.repsMin, it.repsMax, it.restSec];
    }),
  ]);
  const payload: Payload = { v: 1, n: plan.name, d, e };
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

function bad(): never {
  throw new Error(CORRUPTED);
}

function isStrArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function num(v: unknown, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) bad();
  return Math.min(max, Math.max(min, Math.round(v)));
}

function parseExercise(raw: unknown): SharedExercise {
  if (!Array.isArray(raw)) bad();
  const [id, rawName] = raw as unknown[];
  if (typeof id !== 'string' || !id || typeof rawName !== 'string') bad();
  const name = rawName.trim().slice(0, 100).trim();
  if (!name) bad();
  if (raw.length === 2) {
    return { id, name, custom: false, primaryMuscles: [], secondaryMuscles: [], equipment: null };
  }
  if (raw.length !== 5) bad();
  const [, , primary, secondary, equipment] = raw as unknown[];
  if (!isStrArray(primary) || !isStrArray(secondary)) bad();
  if (equipment !== null && typeof equipment !== 'string') bad();
  const clip = (a: string[]) => a.slice(0, 10).map((s) => s.slice(0, 40));
  return {
    id,
    name,
    custom: true,
    primaryMuscles: clip(primary),
    secondaryMuscles: clip(secondary),
    equipment: equipment === null ? null : equipment.slice(0, 40),
  };
}

export function decodePlan(data: string): SharedPlan {
  try {
    const json = LZString.decompressFromEncodedURIComponent(data);
    if (!json) bad();
    const p: unknown = JSON.parse(json);
    if (typeof p !== 'object' || p === null || Array.isArray(p)) bad();
    const o = p as Record<string, unknown>;
    if (o.v !== 1 || typeof o.n !== 'string' || !Array.isArray(o.d) || !Array.isArray(o.e)) bad();
    const name = o.n.trim().slice(0, 80).trim();
    if (!name) bad();
    const exercises = o.e.map(parseExercise);
    const days = o.d.map((rawDay: unknown, i: number) => {
      if (!Array.isArray(rawDay) || rawDay.length !== 2) bad();
      const [rawName, rawItems] = rawDay as unknown[];
      if (typeof rawName !== 'string' || !Array.isArray(rawItems)) bad();
      const items = rawItems.map((rawItem: unknown) => {
        if (!Array.isArray(rawItem) || rawItem.length !== 6) bad();
        const [idx, sets, warmupSets, rMin, rMax, restSec] = rawItem as unknown[];
        if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= exercises.length) bad();
        let repsMin = num(rMin, 1, 100);
        let repsMax = num(rMax, 1, 100);
        if (repsMin > repsMax) repsMin = repsMax = Math.min(repsMin, repsMax);
        return {
          exercise: exercises[idx],
          sets: num(sets, 1, 20),
          warmupSets: num(warmupSets, 0, 10),
          repsMin,
          repsMax,
          restSec: num(restSec, 0, 900),
        };
      });
      return { name: rawName.trim().slice(0, 60).trim() || `Dzień ${i + 1}`, items };
    });
    return { name, days, exercises };
  } catch {
    throw new Error(CORRUPTED);
  }
}

export function shareUrl(data: string, base: string = location.origin + location.pathname): string {
  return `${base}#${SHARE_ROUTE}?d=${data}`;
}

export function extractPayload(text: string): string | null {
  const m = /[?&]d=([A-Za-z0-9+\-$_.]+)/.exec(text);
  return m ? m[1] : null;
}

export function qrFits(url: string): boolean {
  return url.length <= QR_MAX_URL;
}

export type ExerciseStatus = 'known' | 'new-custom' | 'unknown';

const norm = (s: string) => s.trim().toLowerCase();

export async function resolveExercises(
  sp: SharedPlan,
): Promise<Map<string, { status: ExerciseStatus; targetId?: string }>> {
  const all = await db.exercises.toArray();
  const byId = new Map(all.map((e) => [e.id, e]));
  const customByName = new Map<string, Exercise>();
  const anyByName = new Map<string, Exercise>();
  for (const e of all) {
    const key = norm(e.name);
    if (e.custom && !customByName.has(key)) customByName.set(key, e);
    if (!anyByName.has(key)) anyByName.set(key, e);
  }
  const result = new Map<string, { status: ExerciseStatus; targetId?: string }>();
  for (const ex of sp.exercises) {
    if (result.has(ex.id)) continue;
    const sameId = byId.get(ex.id);
    if (sameId) {
      result.set(ex.id, { status: 'known', targetId: sameId.id });
      continue;
    }
    const byName = ex.custom ? customByName.get(norm(ex.name)) : anyByName.get(norm(ex.name));
    if (byName) result.set(ex.id, { status: 'known', targetId: byName.id });
    else result.set(ex.id, { status: ex.custom ? 'new-custom' : 'unknown' });
  }
  return result;
}

function todayLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export async function importSharedPlan(sp: SharedPlan): Promise<Plan> {
  return db.transaction('rw', db.plans, db.exercises, db.settings, async () => {
    const resolved = await resolveExercises(sp);
    const idMap = new Map<string, string>();
    const created = new Set<string>();
    for (const ex of sp.exercises) {
      if (idMap.has(ex.id)) continue;
      const r = resolved.get(ex.id);
      if (r?.status === 'known' && r.targetId) {
        idMap.set(ex.id, r.targetId);
        continue;
      }
      // Same name already created earlier in this import (e.g. two sender ids): reuse it.
      const newId = ex.custom ? ex.id : `custom-${crypto.randomUUID()}`;
      idMap.set(ex.id, newId);
      if (created.has(newId)) continue;
      created.add(newId);
      await db.exercises.add({
        id: newId,
        name: ex.name,
        primaryMuscles: [...ex.primaryMuscles],
        secondaryMuscles: [...ex.secondaryMuscles],
        equipment: ex.equipment,
        category: 'strength',
        instructions: [],
        images: [],
        custom: true,
      });
    }
    const plan: Plan = {
      id: crypto.randomUUID(),
      name: sp.name,
      startedAt: todayLocal(),
      days: sp.days.map((d) => ({
        id: crypto.randomUUID(),
        name: d.name,
        items: d.items.map((it) => ({
          exerciseId: idMap.get(it.exercise.id) ?? it.exercise.id,
          sets: it.sets,
          warmupSets: it.warmupSets,
          repsMin: it.repsMin,
          repsMax: it.repsMax,
          restSec: it.restSec,
        })),
      })),
    };
    await db.plans.add(plan);
    const settings = await getSettings();
    const active = settings.activePlanId ? await db.plans.get(settings.activePlanId) : undefined;
    if (!active) await updateSettings({ activePlanId: plan.id });
    return plan;
  });
}
