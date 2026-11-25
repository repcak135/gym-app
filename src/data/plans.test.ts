import { updateSettings } from './settings';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { getSettings } from './settings';
import {
  DEFAULT_ITEM,
  REST_OPTIONS,
  createPlan,
  copyPlan,
  deletePlan,
  setActivePlan,
  addDay,
  moveDay,
  addItems,
  updateItem,
  moveItem,
  removeItem,
  moveInArray,
  formatRest,
  formatReps,
  formatTarget,
  nextDay,
  getLastPlanDayId,
} from './plans';
import type { Plan } from './types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function getPlan(id: string): Promise<Plan> {
  const p = await db.plans.get(id);
  if (!p) throw new Error('missing');
  return p;
}

describe('plans CRUD', () => {
  it('first plan becomes active, second does not change it', async () => {
    const a = await createPlan('  PPL ');
    expect(a.name).toBe('PPL');
    expect(a.days).toEqual([]);
    expect(a.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await getSettings()).activePlanId).toBe(a.id);
    await createPlan('Other');
    expect((await getSettings()).activePlanId).toBe(a.id);
  });

  it('rejects empty name', async () => {
    await expect(createPlan('   ')).rejects.toThrow('Podaj nazwę');
  });

  it('deleting the active plan clears activePlanId', async () => {
    const a = await createPlan('A');
    await deletePlan(a.id);
    expect((await getSettings()).activePlanId).toBeUndefined();
    expect(await db.plans.get(a.id)).toBeUndefined();
  });

  it('setActivePlan switches active plan', async () => {
    await createPlan('A');
    const b = await createPlan('B');
    await setActivePlan(b.id);
    expect((await getSettings()).activePlanId).toBe(b.id);
  });

  it('copyPlan gives new ids and (kopia) name, keeps active', async () => {
    const a = await createPlan('A');
    const day = await addDay(a.id, 'Push');
    await addItems(a.id, day.id, ['x', 'y']);
    const copy = await copyPlan(a.id);
    const orig = await getPlan(a.id);
    expect(copy.name).toBe('A (kopia)');
    expect(copy.id).not.toBe(a.id);
    expect(copy.days[0].id).not.toBe(orig.days[0].id);
    expect(copy.days[0].items).toEqual(orig.days[0].items);
    expect(copy.days[0].items[0]).not.toBe(orig.days[0].items[0]);
    expect((await getSettings()).activePlanId).toBe(a.id);
  });
});

describe('days', () => {
  it('addDay defaults name, moveDay reorders and is no-op at edges', async () => {
    const p = await createPlan('P');
    const d1 = await addDay(p.id, '');
    const d2 = await addDay(p.id, 'Pull');
    const d3 = await addDay(p.id, 'Legs');
    expect(d1.name).toBe('Day 1');
    await moveDay(p.id, d3.id, -1);
    expect((await getPlan(p.id)).days.map((d) => d.id)).toEqual([d1.id, d3.id, d2.id]);
    await moveDay(p.id, d1.id, -1);
    await moveDay(p.id, d2.id, 1);
    expect((await getPlan(p.id)).days.map((d) => d.id)).toEqual([d1.id, d3.id, d2.id]);
  });

  it('throws for missing plan or day', async () => {
    const p = await createPlan('P');
    await expect(addDay('nope', 'x')).rejects.toThrow('Nie znaleziono planu');
    await expect(addItems(p.id, 'nope', ['a'])).rejects.toThrow('Nie znaleziono dnia');
  });
});

describe('items', () => {
  it('addItems uses defaults from settings; changing settings keeps existing items', async () => {
    const p = await createPlan('P');
    const d = await addDay(p.id, 'D');
    await addItems(p.id, d.id, ['a']);
    let day = (await getPlan(p.id)).days[0];
    expect(day.items[0]).toEqual({ exerciseId: 'a', ...DEFAULT_ITEM });
    await updateSettings({ defaultSets: 4, defaultWarmupSets: 2, defaultRepsMin: 6, defaultRepsMax: 10, defaultRestSec: 180 });
    await addItems(p.id, d.id, ['b']);
    day = (await getPlan(p.id)).days[0];
    expect(day.items[0]).toEqual({ exerciseId: 'a', ...DEFAULT_ITEM });
    expect(day.items[1]).toEqual({ exerciseId: 'b', sets: 4, warmupSets: 2, repsMin: 6, repsMax: 10, restSec: 180 });
  });

  it('updateItem clamps values', async () => {
    const p = await createPlan('P');
    const d = await addDay(p.id, 'D');
    await addItems(p.id, d.id, ['a']);
    await updateItem(p.id, d.id, 0, { repsMin: 12, repsMax: 10 });
    let it = (await getPlan(p.id)).days[0].items[0];
    expect([it.repsMin, it.repsMax]).toEqual([12, 12]);
    await updateItem(p.id, d.id, 0, { sets: 0, warmupSets: 99, restSec: 9999 });
    it = (await getPlan(p.id)).days[0].items[0];
    expect([it.sets, it.warmupSets, it.restSec]).toEqual([1, 10, 600]);
    await updateItem(p.id, d.id, 0, { sets: NaN, repsMin: 3.6 });
    it = (await getPlan(p.id)).days[0].items[0];
    expect(it.sets).toBe(1);
    expect(it.repsMin).toBe(4);
  });

  it('moveItem and removeItem', async () => {
    const p = await createPlan('P');
    const d = await addDay(p.id, 'D');
    await addItems(p.id, d.id, ['a', 'b', 'c']);
    await moveItem(p.id, d.id, 2, 0);
    expect((await getPlan(p.id)).days[0].items.map((i) => i.exerciseId)).toEqual(['c', 'a', 'b']);
    await removeItem(p.id, d.id, 1);
    expect((await getPlan(p.id)).days[0].items.map((i) => i.exerciseId)).toEqual(['c', 'b']);
  });
});

describe('pure helpers', () => {
  it('moveInArray', () => {
    const arr = [1, 2, 3];
    expect(moveInArray(arr, 0, 2)).toEqual([2, 3, 1]);
    expect(moveInArray(arr, 0, 5)).toEqual([1, 2, 3]);
    expect(moveInArray(arr, 0, 5)).not.toBe(arr);
    expect(arr).toEqual([1, 2, 3]);
  });

  it('formatRest', () => {
    expect(formatRest(90)).toBe('1:30');
    expect(formatRest(120)).toBe('2:00');
    expect(formatRest(0)).toBe('0:00');
  });

  it('formatReps', () => {
    expect(formatReps({ repsMin: 10, repsMax: 12 })).toBe('10–12');
    expect(formatReps({ repsMin: 10, repsMax: 10 })).toBe('10');
  });

  it('REST_OPTIONS spans 30..300 step 15', () => {
    expect(REST_OPTIONS[0]).toBe(30);
    expect(REST_OPTIONS[REST_OPTIONS.length - 1]).toBe(300);
    expect(REST_OPTIONS).toHaveLength(19);
  });

  it('nextDay wraps and handles missing', () => {
    const plan: Plan = {
      id: 'p',
      name: 'P',
      startedAt: '2026-11-22',
      days: [
        { id: 'a', name: 'A', items: [] },
        { id: 'b', name: 'B', items: [] },
      ],
    };
    expect(nextDay(plan, 'a')?.id).toBe('b');
    expect(nextDay(plan, 'b')?.id).toBe('a');
    expect(nextDay(plan)?.id).toBe('a');
    expect(nextDay(plan, 'zzz')?.id).toBe('a');
    expect(nextDay({ ...plan, days: [] }, 'a')).toBeUndefined();
  });
});

describe('getLastPlanDayId', () => {
  it('returns dayId of the newest workout for the plan', async () => {
    await db.workouts.bulkAdd([
      { id: 'w1', name: 'x', startedAt: 100, planId: 'p', dayId: 'd1', source: 'app' },
      { id: 'w2', name: 'x', startedAt: 300, planId: 'p', dayId: 'd2', source: 'app' },
      { id: 'w3', name: 'x', startedAt: 500, planId: 'other', dayId: 'd9', source: 'app' },
      { id: 'w4', name: 'x', startedAt: 200, planId: 'p', dayId: 'd3', source: 'app' },
    ]);
    expect(await getLastPlanDayId('p')).toBe('d2');
    expect(await getLastPlanDayId('none')).toBeUndefined();
  });
});

describe('formatTarget', () => {
  const base = { sets: 3, repsMin: 8, repsMax: 12 };
  it('formats by measure', () => {
    expect(formatTarget(base, 'reps')).toBe('3 × 8–12');
    expect(formatTarget({ ...base, targetSec: 30 }, 'time')).toBe('3 × 0:30');
    expect(formatTarget({ ...base, targetM: 40 }, 'distance')).toBe('3 × 40 m');
    expect(formatTarget({ ...base, sets: 1, targetSec: 1200 }, 'timeDistance')).toBe('1 × 20 min');
    expect(formatTarget(base, 'time')).toBe('3 serie');
  });
});
