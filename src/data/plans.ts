import { db } from './db';
import { getSettings, updateSettings } from './settings';
import { formatDistance, formatDuration, measureOf } from './measure';
import { setsLabel } from './plural';
import { linkItems, moveGrouped, removeGrouped, unlinkItems } from './supersets';
import type { Measure, Plan, PlanDay, PlanItem } from './types';

export const DEFAULT_ITEM = { sets: 3, warmupSets: 0, repsMin: 8, repsMax: 12, restSec: 120 };

export const REST_OPTIONS: number[] = Array.from({ length: 19 }, (_, i) => 30 + i * 15);

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function moveInArray<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function formatRest(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatReps(item: Pick<PlanItem, 'repsMin' | 'repsMax'>): string {
  return item.repsMin === item.repsMax ? `${item.repsMin}` : `${item.repsMin}–${item.repsMax}`;
}

/** Plan line "3 × 8–12" for reps, "3 × 0:30" for holds, "3 × 40 m" for distance, "1 × 20 min" for cardio. */
export function formatTarget(
  item: Pick<PlanItem, 'sets' | 'repsMin' | 'repsMax' | 'targetSec' | 'targetM'>,
  measure: Measure = 'reps',
): string {
  if (measure === 'reps') return `${item.sets} × ${formatReps(item)}`;
  if (measure === 'time' && item.targetSec) return `${item.sets} × ${formatDuration(item.targetSec)}`;
  if (measure === 'distance' && item.targetM) return `${item.sets} × ${formatDistance(item.targetM, 'distance')}`;
  if (measure === 'timeDistance') {
    if (item.targetSec) {
      return `${item.sets} × ${item.targetSec % 60 === 0 ? `${item.targetSec / 60} min` : formatDuration(item.targetSec)}`;
    }
    if (item.targetM) return `${item.sets} × ${formatDistance(item.targetM, 'timeDistance')}`;
  }
  return setsLabel(item.sets);
}

export function nextDay(plan: Plan, lastDayId?: string): PlanDay | undefined {
  if (plan.days.length === 0) return undefined;
  const idx = lastDayId ? plan.days.findIndex((d) => d.id === lastDayId) : -1;
  if (idx === -1) return plan.days[0];
  return plan.days[(idx + 1) % plan.days.length];
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function todayLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Podaj nazwę');
  return trimmed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

async function mutatePlan(planId: string, fn: (plan: Plan) => void): Promise<void> {
  await db.transaction('rw', db.plans, async () => {
    const plan = await db.plans.get(planId);
    if (!plan) throw new Error('Nie znaleziono planu');
    fn(plan);
    await db.plans.put(plan);
  });
}

async function mutateDay(planId: string, dayId: string, fn: (day: PlanDay) => void): Promise<void> {
  await mutatePlan(planId, (plan) => {
    const day = plan.days.find((d) => d.id === dayId);
    if (!day) throw new Error('Nie znaleziono dnia');
    fn(day);
  });
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export async function createPlan(name: string): Promise<Plan> {
  const clean = cleanName(name);
  const plan: Plan = { id: crypto.randomUUID(), name: clean, startedAt: todayLocal(), days: [] };
  await db.plans.add(plan);
  const settings = await getSettings();
  const active = settings.activePlanId ? await db.plans.get(settings.activePlanId) : undefined;
  if (!active) await updateSettings({ activePlanId: plan.id });
  return plan;
}

export async function renamePlan(id: string, name: string): Promise<void> {
  const clean = cleanName(name);
  await mutatePlan(id, (plan) => {
    plan.name = clean;
  });
}

export async function copyPlan(id: string): Promise<Plan> {
  const src = await db.plans.get(id);
  if (!src) throw new Error('Nie znaleziono planu');
  const copy: Plan = {
    id: crypto.randomUUID(),
    name: `${src.name} (kopia)`,
    startedAt: todayLocal(),
    days: src.days.map((d) => ({
      id: crypto.randomUUID(),
      name: d.name,
      items: d.items.map((it) => ({ ...it })),
    })),
  };
  await db.plans.add(copy);
  return copy;
}

export async function deletePlan(id: string): Promise<void> {
  await db.plans.delete(id);
  const settings = await getSettings();
  if (settings.activePlanId === id) await updateSettings({ activePlanId: undefined });
}

export async function setActivePlan(id: string): Promise<void> {
  await updateSettings({ activePlanId: id });
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

export async function addDay(planId: string, name: string): Promise<PlanDay> {
  let day!: PlanDay;
  await mutatePlan(planId, (plan) => {
    day = { id: crypto.randomUUID(), name: name.trim() || `Day ${plan.days.length + 1}`, items: [] };
    plan.days.push(day);
  });
  return day;
}

export async function renameDay(planId: string, dayId: string, name: string): Promise<void> {
  await mutateDay(planId, dayId, (day) => {
    day.name = name.trim() || day.name;
  });
}

export async function moveDay(planId: string, dayId: string, dir: -1 | 1): Promise<void> {
  await mutatePlan(planId, (plan) => {
    const idx = plan.days.findIndex((d) => d.id === dayId);
    if (idx === -1) throw new Error('Nie znaleziono dnia');
    plan.days = moveInArray(plan.days, idx, idx + dir);
  });
}

export async function deleteDay(planId: string, dayId: string): Promise<void> {
  await mutatePlan(planId, (plan) => {
    if (!plan.days.some((d) => d.id === dayId)) throw new Error('Nie znaleziono dnia');
    plan.days = plan.days.filter((d) => d.id !== dayId);
  });
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export async function addItems(planId: string, dayId: string, exerciseIds: string[]): Promise<void> {
  // New items take the defaults from Ustawienia; existing items keep their own values.
  const s = await getSettings();
  const measures = new Map((await db.exercises.bulkGet(exerciseIds)).map((e, i) => [exerciseIds[i], measureOf(e)]));
  await mutateDay(planId, dayId, (day) => {
    for (const exerciseId of exerciseIds) {
      const m = measures.get(exerciseId);
      day.items.push({
        exerciseId,
        sets: s.defaultSets,
        warmupSets: s.defaultWarmupSets,
        repsMin: s.defaultRepsMin,
        repsMax: s.defaultRepsMax,
        restSec: s.defaultRestSec,
        ...(m === 'time' ? { targetSec: 30 } : m === 'distance' ? { targetM: 40 } : m === 'timeDistance' ? { targetSec: 1200 } : {}),
      });
    }
  });
}

export async function updateItem(
  planId: string,
  dayId: string,
  index: number,
  patch: Partial<Omit<PlanItem, 'exerciseId'>>,
): Promise<void> {
  await mutateDay(planId, dayId, (day) => {
    const item = day.items[index];
    if (!item) return;
    for (const key of ['targetSec', 'targetM'] as const) {
      const v = patch[key];
      if (typeof v === 'number' && Number.isFinite(v)) item[key] = clamp(v, 0, 100000);
    }
    const apply = (key: 'sets' | 'warmupSets' | 'repsMin' | 'repsMax' | 'restSec', min: number, max: number) => {
      const v = patch[key];
      if (typeof v === 'number' && Number.isFinite(v)) item[key] = clamp(v, min, max);
    };
    apply('sets', 1, 20);
    apply('warmupSets', 0, 10);
    apply('repsMin', 1, 100);
    apply('repsMax', 1, 100);
    apply('restSec', 0, 600);
    item.repsMax = Math.max(item.repsMin, item.repsMax);
  });
}

export async function moveItem(planId: string, dayId: string, from: number, to: number): Promise<void> {
  await mutateDay(planId, dayId, (day) => {
    day.items = moveGrouped(day.items, from, to);
  });
}

export async function removeItem(planId: string, dayId: string, index: number): Promise<void> {
  await mutateDay(planId, dayId, (day) => {
    day.items = removeGrouped(day.items, index);
  });
}

/** Joins item `index` with the next one into a superset / circuit (max 3 items). */
export async function linkWithNext(planId: string, dayId: string, index: number): Promise<boolean> {
  let ok = false;
  await mutateDay(planId, dayId, (day) => {
    const next = linkItems(day.items, index);
    if (next) {
      day.items = next;
      ok = true;
    }
  });
  return ok;
}

/** Removes item `index` from its superset; a group left with one item dissolves. */
export async function unlinkItem(planId: string, dayId: string, index: number): Promise<void> {
  await mutateDay(planId, dayId, (day) => {
    day.items = unlinkItems(day.items, index);
  });
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export async function getLastPlanDayId(planId: string): Promise<string | undefined> {
  const all = await db.workouts.toArray();
  const matching = all
    .filter((w) => w.planId === planId && w.dayId)
    .sort((a, b) => b.startedAt - a.startedAt);
  return matching[0]?.dayId;
}
