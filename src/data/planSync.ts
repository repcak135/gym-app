import { db } from './db';
import { createPlan } from './plans';
import type { PlanDay, PlanItem, Workout, WorkoutExercise } from './types';

export type PlanChange =
  | { kind: 'swap'; index: number; fromExerciseId: string; toExerciseId: string }
  | { kind: 'add'; exerciseId: string; item: PlanItem }
  | { kind: 'remove'; exerciseId: string }
  | { kind: 'sets'; exerciseId: string; from: number; to: number } // working sets
  | { kind: 'warmups'; exerciseId: string; from: number; to: number };

interface DoneCounts {
  working: number;
  warmup: number;
}

async function completedCounts(workoutId: string): Promise<Map<string, DoneCounts>> {
  const sets = await db.sets.where('workoutId').equals(workoutId).toArray();
  const map = new Map<string, DoneCounts>();
  for (const s of sets) {
    if (s.completedAt === undefined) continue;
    const c = map.get(s.exerciseId) ?? { working: 0, warmup: 0 };
    if (s.warmup) c.warmup++;
    else c.working++;
    map.set(s.exerciseId, c);
  }
  return map;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** A plan item built from what was actually done; null when nothing was completed. */
function itemFromDone(ex: WorkoutExercise, done: DoneCounts | undefined): PlanItem | null {
  if (!done || done.working + done.warmup === 0) return null;
  return {
    exerciseId: ex.exerciseId,
    sets: clamp(done.working, 1, 20),
    warmupSets: clamp(done.warmup, 0, 10),
    repsMin: ex.repsMin,
    repsMax: ex.repsMax,
    restSec: ex.restSec,
  };
}

/** What the finished workout changed compared with the plan day it was started from. */
export async function diffWorkoutVsPlan(workoutId: string): Promise<PlanChange[]> {
  const w = await db.workouts.get(workoutId);
  if (!w || w.endedAt === undefined || !w.planId || !w.dayId || !w.exercises) return [];
  const plan = await db.plans.get(w.planId);
  const day = plan?.days.find((d) => d.id === w.dayId);
  if (!day) return [];

  const done = await completedCounts(workoutId);
  const planIds = new Set(day.items.map((it) => it.exerciseId));
  const workoutIds = new Set(w.exercises.map((e) => e.exerciseId));
  const changes: PlanChange[] = [];
  const swappedFrom = new Set<string>();
  const swappedTo = new Set<string>();

  for (let i = 0; i < Math.min(day.items.length, w.exercises.length); i++) {
    const from = day.items[i].exerciseId;
    const to = w.exercises[i].exerciseId;
    if (!workoutIds.has(from) && !planIds.has(to)) {
      changes.push({ kind: 'swap', index: i, fromExerciseId: from, toExerciseId: to });
      swappedFrom.add(from);
      swappedTo.add(to);
    }
  }

  const seen = new Set<string>();
  for (const it of day.items) {
    if (workoutIds.has(it.exerciseId) || swappedFrom.has(it.exerciseId) || seen.has(it.exerciseId)) continue;
    seen.add(it.exerciseId);
    changes.push({ kind: 'remove', exerciseId: it.exerciseId });
  }

  for (const ex of w.exercises) {
    if (planIds.has(ex.exerciseId) || swappedTo.has(ex.exerciseId)) continue;
    const item = itemFromDone(ex, done.get(ex.exerciseId));
    if (item) changes.push({ kind: 'add', exerciseId: ex.exerciseId, item });
  }

  // Set counts: compare the structure the user kept (sets added or removed on purpose,
  // tracked on the workout's exercise entry), not what got completed — finishing early
  // must not shrink the plan.
  for (const ex of w.exercises) {
    const item = day.items.find((it) => it.exerciseId === ex.exerciseId);
    const c = done.get(ex.exerciseId);
    if (!item || !c || c.working + c.warmup === 0) continue;
    if (ex.sets > 0 && ex.sets !== item.sets) {
      changes.push({ kind: 'sets', exerciseId: ex.exerciseId, from: item.sets, to: ex.sets });
    }
    if (ex.warmupSets !== item.warmupSets) {
      changes.push({ kind: 'warmups', exerciseId: ex.exerciseId, from: item.warmupSets, to: ex.warmupSets });
    }
  }
  return changes;
}

export async function applyPlanChanges(planId: string, dayId: string, changes: PlanChange[]): Promise<void> {
  await db.transaction('rw', db.plans, async () => {
    const plan = await db.plans.get(planId);
    const day = plan?.days.find((d) => d.id === dayId);
    if (!plan || !day) throw new Error('Nie znaleziono dnia');
    // Swaps first: they are addressed by position, which removals would shift.
    for (const c of changes) {
      if (c.kind === 'swap' && day.items[c.index]) day.items[c.index].exerciseId = c.toExerciseId;
    }
    for (const c of changes) {
      if (c.kind === 'sets') {
        const it = day.items.find((x) => x.exerciseId === c.exerciseId);
        if (it) it.sets = clamp(c.to, 1, 20);
      } else if (c.kind === 'warmups') {
        const it = day.items.find((x) => x.exerciseId === c.exerciseId);
        if (it) it.warmupSets = clamp(c.to, 0, 10);
      }
    }
    for (const c of changes) {
      if (c.kind === 'remove') day.items = day.items.filter((x) => x.exerciseId !== c.exerciseId);
    }
    for (const c of changes) {
      if (c.kind === 'add') day.items.push({ ...c.item });
    }
    await db.plans.put(plan);
  });
}

export async function saveWorkoutAsDay(
  workoutId: string,
  target: { planId: string } | { newPlanName: string },
  dayName: string,
): Promise<{ planId: string; dayId: string }> {
  const w: Workout | undefined = await db.workouts.get(workoutId);
  if (!w) throw new Error('Nie znaleziono treningu');
  const done = await completedCounts(workoutId);
  const items: PlanItem[] = [];
  for (const ex of w.exercises ?? []) {
    const item = itemFromDone(ex, done.get(ex.exerciseId));
    if (item) items.push(item);
  }
  if (items.length === 0) throw new Error('Brak zaliczonych serii');

  // createPlan makes the new plan active when there is no active one yet.
  const planId = 'planId' in target ? target.planId : (await createPlan(target.newPlanName)).id;
  const day: PlanDay = { id: crypto.randomUUID(), name: dayName.trim() || w.name, items };
  await db.transaction('rw', db.plans, db.workouts, async () => {
    const plan = await db.plans.get(planId);
    if (!plan) throw new Error('Nie znaleziono planu');
    plan.days.push(day);
    await db.plans.put(plan);
    // The workout now belongs to this day; align its recorded structure with the saved items.
    const exercises = (w.exercises ?? []).map((ex) => {
      const it = items.find((x) => x.exerciseId === ex.exerciseId);
      return it ? { ...ex, sets: it.sets, warmupSets: it.warmupSets } : ex;
    });
    await db.workouts.update(workoutId, { planId, dayId: day.id, exercises });
  });
  return { planId, dayId: day.id };
}
