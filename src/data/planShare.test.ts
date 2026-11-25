import LZString from 'lz-string';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { getSettings } from './settings';
import {
  encodePlan,
  decodePlan,
  extractPayload,
  qrFits,
  shareUrl,
  resolveExercises,
  importSharedPlan,
} from './planShare';
import type { Exercise, Plan } from './types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function ex(id: string, name: string, custom: boolean, extra: Partial<Exercise> = {}): Exercise {
  return {
    id,
    name,
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: null,
    category: 'strength',
    instructions: [],
    images: [],
    custom,
    ...extra,
  };
}

const bench = ex('bench', 'Bench Press', false);
const fly = ex('fly-1', 'My Fly', true, { primaryMuscles: ['chest'], secondaryMuscles: ['shoulders'], equipment: 'cable' });
const exMap = new Map([bench, fly].map((e) => [e.id, e]));

function samplePlan(): Plan {
  return {
    id: 'p1',
    name: 'PPL',
    startedAt: '2026-01-01',
    days: [
      {
        id: 'd1',
        name: 'Push',
        items: [
          { exerciseId: 'bench', sets: 4, warmupSets: 1, repsMin: 6, repsMax: 10, restSec: 150 },
          { exerciseId: 'fly-1', sets: 3, warmupSets: 0, repsMin: 10, repsMax: 15, restSec: 90 },
        ],
      },
      {
        id: 'd2',
        name: 'Pull',
        items: [{ exerciseId: 'fly-1', sets: 2, warmupSets: 0, repsMin: 8, repsMax: 12, restSec: 60 }],
      },
    ],
  };
}

const enc = (o: unknown) => LZString.compressToEncodedURIComponent(JSON.stringify(o));

describe('encode/decode', () => {
  it('round-trip keeps name, days, items and custom exercise fields', () => {
    const sp = decodePlan(encodePlan(samplePlan(), exMap));
    expect(sp.name).toBe('PPL');
    expect(sp.days.map((d) => d.name)).toEqual(['Push', 'Pull']);
    expect(sp.exercises).toHaveLength(2);
    const it0 = sp.days[0].items[0];
    expect(it0).toMatchObject({ sets: 4, warmupSets: 1, repsMin: 6, repsMax: 10, restSec: 150 });
    expect(it0.exercise).toEqual({
      id: 'bench', name: 'Bench Press', custom: false, primaryMuscles: [], secondaryMuscles: [], equipment: null,
    });
    expect(sp.days[0].items[1].exercise).toEqual({
      id: 'fly-1', name: 'My Fly', custom: true, primaryMuscles: ['chest'], secondaryMuscles: ['shoulders'], equipment: 'cable',
    });
    expect(sp.days[1].items[0].exercise.id).toBe('fly-1');
  });

  it('round-trip keeps groups and time/distance targets; old payloads carry none', () => {
    const plan = samplePlan();
    plan.days[0].items[0] = { ...plan.days[0].items[0], group: 'x', targetSec: 45 };
    plan.days[0].items[1] = { ...plan.days[0].items[1], group: 'x', targetM: 40 };
    const sp = decodePlan(encodePlan(plan, exMap));
    const [a, b] = sp.days[0].items;
    expect(a.group).toBeTruthy();
    expect(a.group).toBe(b.group);
    expect(a.targetSec).toBe(45);
    expect(b.targetM).toBe(40);
    expect(sp.days[1].items[0].group).toBeUndefined();
    const old = decodePlan(enc({ v: 1, n: 'X', d: [['D', [[0, 3, 0, 8, 12, 60]]]], e: [['a', 'A']] }));
    expect(old.days[0].items[0].group).toBeUndefined();
    expect(old.days[0].items[0].targetSec).toBeUndefined();
  });

  it('encoded string is URL-safe', () => {
    expect(encodePlan(samplePlan(), exMap)).toMatch(/^[A-Za-z0-9+\-$_.]*$/);
  });

  it('corrupted payload throws Link jest uszkodzony', () => {
    const data = encodePlan(samplePlan(), exMap);
    const badIndex = enc({ v: 1, n: 'X', d: [['D', [[99, 3, 0, 8, 12, 60]]]], e: [['a', 'A']] });
    const inputs = [
      'abc',
      '',
      data.slice(0, data.length / 2),
      LZString.compressToEncodedURIComponent('{"v":2}'),
      LZString.compressToEncodedURIComponent('[]'),
      badIndex,
      enc({ v: 1, n: '  ', d: [], e: [] }),
      enc({ v: 1, n: 'X', d: [['D', [[0, 'x', 0, 8, 12, 60]]]], e: [['a', 'A']] }),
    ];
    for (const s of inputs) expect(() => decodePlan(s)).toThrow(new Error('Link jest uszkodzony'));
  });

  it('numbers are clamped', () => {
    const data = enc({
      v: 1,
      n: ' Plan ',
      d: [['', [[0, 999, 99, 12, 8, 5000]]]],
      e: [['a', ' A ']],
    });
    const sp = decodePlan(data);
    expect(sp.name).toBe('Plan');
    expect(sp.days[0].name).toBe('Dzień 1');
    expect(sp.exercises[0].name).toBe('A');
    expect(sp.days[0].items[0]).toMatchObject({ sets: 20, warmupSets: 10, repsMin: 8, repsMax: 8, restSec: 900 });
  });
});

describe('links', () => {
  it('extractPayload finds d= in pasted text', () => {
    expect(extractPayload('Zobacz: https://x/gym-app/#/plan?d=N4Ig ok')).toBe('N4Ig');
    expect(extractPayload('hello')).toBeNull();
  });

  it('qrFits', () => {
    expect(qrFits('a'.repeat(1800))).toBe(true);
    expect(qrFits('a'.repeat(1801))).toBe(false);
  });

  it('shareUrl builds hash route', () => {
    expect(shareUrl('abc', 'https://x/app/')).toBe('https://x/app/#/plan?d=abc');
  });
});

describe('import', () => {
  it('creates missing custom exercise, reuses existing by id and by name, unknown built-in becomes custom', async () => {
    await db.exercises.bulkAdd([bench, ex('local-fly', 'my fly ', true), ex('b2', 'Squat', false)]);
    const sp = decodePlan(
      enc({
        v: 1,
        n: 'Mix',
        d: [
          ['A', [[0, 3, 0, 8, 12, 60], [1, 3, 0, 8, 12, 60], [2, 3, 0, 8, 12, 60], [3, 3, 0, 8, 12, 60], [4, 3, 0, 8, 12, 60]]],
          ['B', [[3, 3, 0, 8, 12, 60]]],
        ],
        e: [
          ['bench', 'Bench Press'],
          ['fly-1', 'My Fly', ['chest'], [], 'cable'],
          ['new-c', 'Brand New', ['back'], [], null],
          ['zzz', 'Mystery Lift'],
          ['other-squat', 'SQUAT'],
        ],
      }),
    );
    const res = await resolveExercises(sp);
    expect(res.get('bench')).toEqual({ status: 'known', targetId: 'bench' });
    expect(res.get('fly-1')).toEqual({ status: 'known', targetId: 'local-fly' });
    expect(res.get('new-c')?.status).toBe('new-custom');
    expect(res.get('zzz')?.status).toBe('unknown');
    expect(res.get('other-squat')).toEqual({ status: 'known', targetId: 'b2' });

    const plan = await importSharedPlan(sp);
    const ids = plan.days[0].items.map((i) => i.exerciseId);
    expect(ids[0]).toBe('bench');
    expect(ids[1]).toBe('local-fly');
    expect(ids[2]).toBe('new-c');
    expect(ids[3]).toMatch(/^custom-/);
    expect(ids[4]).toBe('b2');
    expect(plan.days[1].items[0].exerciseId).toBe(ids[3]);
    const created = await db.exercises.get('new-c');
    expect(created).toMatchObject({ custom: true, primaryMuscles: ['back'], category: 'strength', instructions: [], images: [] });
    const mystery = await db.exercises.get(ids[3]);
    expect(mystery).toMatchObject({ name: 'Mystery Lift', custom: true, primaryMuscles: [], equipment: null });
    // 3 pre-existing + 2 created (the unknown one used in two days only once)
    expect(await db.exercises.count()).toBe(5);
  });

  it('import twice does not duplicate the custom exercise', async () => {
    const sp = decodePlan(encodePlan(samplePlan(), exMap));
    await importSharedPlan(sp);
    await importSharedPlan(sp);
    const flies = (await db.exercises.toArray()).filter((e) => e.name === 'My Fly');
    expect(flies).toHaveLength(1);
    expect(await db.plans.count()).toBe(2);
  });

  it('imported plan is an independent copy and becomes active when none is active', async () => {
    const source = samplePlan();
    await db.exercises.bulkAdd([bench, fly]);
    await db.plans.add(source);
    const sp = decodePlan(encodePlan(source, exMap));
    const plan = await importSharedPlan(sp);
    expect(plan.id).not.toBe(source.id);
    expect(plan.days.map((d) => d.id)).not.toContain('d1');
    expect(plan.days.map((d) => d.id)).not.toContain('d2');
    expect(plan.name).toBe('PPL');
    expect((await getSettings()).activePlanId).toBe(plan.id);

    plan.days[0].items[0].sets = 9;
    await db.plans.put(plan);
    expect((await db.plans.get('p1'))?.days[0].items[0].sets).toBe(4);

    const second = await importSharedPlan(sp);
    expect((await getSettings()).activePlanId).toBe(plan.id);
    expect(second.id).not.toBe(plan.id);
  });
});
