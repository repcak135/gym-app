import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { updateSettings } from './settings';
import { PLAN_TEMPLATES, TEMPLATE_CREDIT, createPlanFromTemplate } from './templates';
import exerciseDb from './exercise-db.json';
import extra from './exercises-extra.json';
import og from './exercises-og.json';
import merged from './exercise-merged.json';
import type { Exercise } from './types';

const catalogue = (() => {
  const ogData = og as unknown as { added: { id: string }[] };
  const ids = new Set<string>([
    ...(exerciseDb as { id: string }[]).map((e) => e.id),
    ...(extra as { id: string }[]).map((e) => e.id),
    ...ogData.added.map((e) => e.id),
  ]);
  for (const k of Object.keys(merged)) ids.delete(k);
  return ids;
})();

const allIds = [
  ...new Set(
    PLAN_TEMPLATES.flatMap((t) => t.days.flatMap((d) => d.items.flatMap((i) => [i.exerciseId, ...(i.fallback ?? [])]))),
  ),
];

const fakeExercise = (id: string): Exercise => ({
  id,
  name: id,
  primaryMuscles: [],
  secondaryMuscles: [],
  equipment: null,
  category: 'strength',
  instructions: [],
  images: [],
  custom: false,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.exercises.bulkPut(allIds.map(fakeExercise));
});

describe('template data', () => {
  it('every exercise id and fallback exists in the real catalogue', () => {
    expect(allIds.filter((id) => !catalogue.has(id))).toEqual([]);
  });

  it('only the credit constant mentions the author', () => {
    expect(TEMPLATE_CREDIT).toContain('Sakowski');
    for (const t of PLAN_TEMPLATES) for (const p of t.description) expect(p).not.toContain('Sakowski');
  });
});

describe('createPlanFromTemplate', () => {
  it('builds fbw-women with days A/B and 7 + 7 items', async () => {
    await updateSettings({ defaultRestSec: 95 });
    const plan = await createPlanFromTemplate('fbw-women');
    expect(plan.days.map((d) => d.name)).toEqual(['A', 'B']);
    expect(plan.days.map((d) => d.items.length)).toEqual([7, 7]);
    for (const it of plan.days.flatMap((d) => d.items)) {
      expect(it.restSec).toBe(95);
      expect(it.warmupSets).toBe(0);
    }
    expect(plan.days[0].items[0]).toMatchObject({ exerciseId: 'Barbell_Squat', sets: 5, repsMin: 5, repsMax: 5 });
    expect(plan.days[1].items.find((i) => i.exerciseId === 'Plank')?.targetSec).toBe(30);
    expect(await db.plans.get(plan.id)).toEqual(plan);
    expect(plan.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('does not change the active plan', async () => {
    await createPlanFromTemplate('fbw-men');
    expect((await db.settings.get('app'))?.activePlanId).toBeUndefined();
  });

  it('uses the fallback when Barbell_Hip_Thrust is missing', async () => {
    await db.exercises.delete('Barbell_Hip_Thrust');
    const plan = await createPlanFromTemplate('fbw-women');
    expect(plan.days[0].items.map((i) => i.exerciseId)).toContain('x-dumbbell-hip-thrust');
    expect(plan.days[0].items.length).toBe(7);
  });

  it('skips an item when the id and all fallbacks are missing', async () => {
    await db.exercises.bulkDelete(['Barbell_Hip_Thrust', 'x-dumbbell-hip-thrust']);
    const plan = await createPlanFromTemplate('fbw-women');
    expect(plan.days[0].items.length).toBe(6);
  });

  it('two calls make two plans with different ids and names', async () => {
    const a = await createPlanFromTemplate('intermediate-4');
    const b = await createPlanFromTemplate('intermediate-4');
    expect(a.id).not.toBe(b.id);
    expect(b.name).toBe(`${a.name} (2)`);
    expect(await db.plans.count()).toBe(2);
    expect(a.days[0].id).not.toBe(b.days[0].id);
  });

  it('rejects an unknown template', async () => {
    await expect(createPlanFromTemplate('nope')).rejects.toThrow();
  });
});
