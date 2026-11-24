import { db } from './db';
import { createPlan } from './plans';
import { getSettings } from './settings';
import { isFinished } from './workouts';
import type { PlanDay, PlanItem, WorkoutSet } from './types';

export interface DayCandidate {
  name: string;
  sourceWorkoutId: string;
  lastDate: number;
  occurrences: number;
  items: PlanItem[];
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));

/** Plan items from one workout's sets, exercises in logged order. */
function itemsFromSets(
  sets: WorkoutSet[],
  d: { defaultRepsMin: number; defaultRepsMax: number; defaultRestSec: number },
): PlanItem[] {
  const byExercise = new Map<number, WorkoutSet[]>();
  for (const s of sets) {
    const list = byExercise.get(s.exerciseOrder) ?? [];
    list.push(s);
    byExercise.set(s.exerciseOrder, list);
  }
  return [...byExercise.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, list]) => {
      const working = list.filter((s) => !s.warmup);
      const reps = working.map((s) => s.reps).filter((r) => r > 0);
      const repsMin = reps.length ? clamp(Math.min(...reps), 1, 100) : d.defaultRepsMin;
      const repsMax = reps.length ? clamp(Math.max(...reps), 1, 100) : d.defaultRepsMax;
      return {
        exerciseId: list[0].exerciseId,
        sets: Math.max(1, working.length),
        warmupSets: list.length - working.length,
        repsMin,
        repsMax: Math.max(repsMin, repsMax),
        restSec: d.defaultRestSec,
      };
    });
}

/** Day candidates from the `limit` most recent finished workouts, grouped by workout name. */
export async function planCandidates(limit = 20): Promise<DayCandidate[]> {
  const all = await db.workouts.toArray();
  const recent = all
    .filter(isFinished)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
  const settings = await getSettings();

  const groups = new Map<string, typeof recent>();
  for (const w of recent) {
    const key = w.name.trim().toLowerCase();
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(w);
    groups.set(key, list);
  }

  const result: DayCandidate[] = [];
  for (const list of groups.values()) {
    // list is newest first; the newest workout with sets defines the day
    for (const w of list) {
      const sets = (await db.sets.where('workoutId').equals(w.id).toArray()).filter(
        (s) => s.completedAt !== undefined,
      );
      if (sets.length === 0) continue;
      result.push({
        name: list[0].name.trim(),
        sourceWorkoutId: w.id,
        lastDate: list[0].startedAt,
        occurrences: list.length,
        items: itemsFromSets(sets, settings),
      });
      break;
    }
  }
  return result.sort((a, b) => b.lastDate - a.lastDate);
}

export async function createPlanFromCandidates(
  days: DayCandidate[],
  target: { planId: string } | { newPlanName: string },
): Promise<string> {
  const planId = 'planId' in target ? target.planId : (await createPlan(target.newPlanName)).id;
  const newDays: PlanDay[] = days.map((d) => ({
    id: crypto.randomUUID(),
    name: d.name,
    items: d.items.map((it) => ({ ...it })),
  }));
  await db.transaction('rw', db.plans, async () => {
    const plan = await db.plans.get(planId);
    if (!plan) throw new Error('Nie znaleziono planu');
    plan.days.push(...newDays);
    await db.plans.put(plan);
  });
  return planId;
}
