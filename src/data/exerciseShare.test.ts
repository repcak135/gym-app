import LZString from 'lz-string';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import {
  encodeExercises,
  decodeExercises,
  exercisesShareUrl,
  existingCustomNames,
  importSharedExercises,
} from './exerciseShare';
import { encodePlan, decodePlan } from './planShare';
import type { Exercise, Plan } from './types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function ex(name: string, extra: Partial<Exercise> = {}): Exercise {
  return {
    id: `custom-${name}`,
    name,
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps'],
    equipment: 'cable',
    category: 'strength',
    instructions: ['secret'],
    images: [],
    custom: true,
    ...extra,
  };
}

const enc = (o: unknown) => LZString.compressToEncodedURIComponent(JSON.stringify(o));

describe('exercise payload', () => {
  it('carries measure of a custom exercise; old links without it still decode', async () => {
    const data = encodeExercises([ex('Deska', { measure: 'time' }), ex('Fly')]);
    const back = decodeExercises(data);
    expect(back[0].measure).toBe('time');
    expect(back[1].measure).toBeUndefined();
    const old = enc({ v: 1, t: 'x', x: [['Stary', ['chest'], [], null, 'strength']] });
    expect(decodeExercises(old)).toEqual([
      { name: 'Stary', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: null, category: 'strength' },
    ]);
    const junk = enc({ v: 1, t: 'x', x: [['X', [], [], null, 'strength', 'bogus']] });
    expect(decodeExercises(junk)[0].measure).toBeUndefined();
    await importSharedExercises(back);
    expect((await db.exercises.filter((e) => e.name === 'Deska').first())?.measure).toBe('time');
  });

  it('round-trips without the id, note or instructions', () => {
    const data = encodeExercises([ex('Fly'), ex('Row', { primaryMuscles: ['lats'], equipment: null })]);
    expect(decodeExercises(data)).toEqual([
      { name: 'Fly', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'cable', category: 'strength' },
      { name: 'Row', primaryMuscles: ['lats'], secondaryMuscles: ['triceps'], equipment: null, category: 'strength' },
    ]);
    expect(LZString.decompressFromEncodedURIComponent(data)).not.toContain('secret');
  });

  it('builds a link to the exercises import route', () => {
    expect(exercisesShareUrl('abc', 'https://x.test/app/')).toBe('https://x.test/app/#/cwiczenia/import?d=abc');
  });

  it('accepts 1..50 exercises only', () => {
    expect(() => encodeExercises([])).toThrow();
    const many = Array.from({ length: 51 }, (_, i) => ex(`E${i}`));
    expect(() => encodeExercises(many)).toThrow();
    expect(decodeExercises(encodeExercises(many.slice(0, 50)))).toHaveLength(50);
    expect(() => decodeExercises(enc({ v: 1, t: 'x', x: [] }))).toThrow('Link jest uszkodzony');
    expect(() => decodeExercises(enc({ v: 1, t: 'x', x: many.map((e) => [e.name, [], [], null, 'strength']) }))).toThrow();
  });

  it('rejects corrupted data', () => {
    const good = encodeExercises([ex('Fly')]);
    expect(() => decodeExercises(good.slice(0, good.length - 8))).toThrow('Link jest uszkodzony');
    expect(() => decodeExercises('')).toThrow('Link jest uszkodzony');
    expect(() => decodeExercises(enc({ v: 2, t: 'x', x: [['A', [], [], null, 's']] }))).toThrow();
    expect(() => decodeExercises(enc({ v: 1, t: 'x', x: [['  ', [], [], null, 's']] }))).toThrow();
    expect(() => decodeExercises(enc({ v: 1, t: 'x', x: [['A', 'chest', [], null, 's']] }))).toThrow();
    expect(() => decodeExercises(enc({ v: 1, t: 'x', x: [['A', [], [], 5, 's']] }))).toThrow();
  });

  it('caps lengths', () => {
    const [d] = decodeExercises(
      enc({ v: 1, t: 'x', x: [['n'.repeat(300), Array(30).fill('m'.repeat(90)), [], 'e'.repeat(90), 's']] }),
    );
    expect(d.name).toHaveLength(100);
    expect(d.primaryMuscles).toHaveLength(10);
    expect(d.primaryMuscles[0]).toHaveLength(40);
    expect(d.equipment).toHaveLength(40);
  });

  it('is distinguishable from a plan payload', () => {
    const plan: Plan = { id: 'p', name: 'P', startedAt: '2026-01-01', days: [] };
    const planData = encodePlan(plan, new Map());
    expect(() => decodeExercises(planData)).toThrow('Link jest uszkodzony');
    expect(() => decodePlan(encodeExercises([ex('Fly')]))).toThrow('Link jest uszkodzony');
  });
});

describe('importSharedExercises', () => {
  it('adds new ones as custom with new ids and skips same-name custom ones', async () => {
    await db.exercises.add(ex('my fly', { id: 'custom-mine' }));
    const items = decodeExercises(encodeExercises([ex('My Fly'), ex('Row'), ex('row')]));
    expect([...(await existingCustomNames(items))]).toEqual(['my fly']);
    const r = await importSharedExercises(items);
    expect(r).toEqual({ added: 1, skipped: 2 });
    const custom = await db.exercises.filter((e) => e.custom).toArray();
    expect(custom.map((e) => e.name).sort()).toEqual(['Row', 'my fly']);
    const row = custom.find((e) => e.name === 'Row')!;
    expect(row.id).not.toBe('custom-Row');
    expect(row.id.startsWith('custom-')).toBe(true);
    expect(row.primaryMuscles).toEqual(['chest']);
    // second import adds nothing
    expect(await importSharedExercises(items)).toEqual({ added: 0, skipped: 3 });
  });

  it('does not treat a built-in with the same name as present', async () => {
    await db.exercises.add(ex('Row', { id: 'builtin-row', custom: false }));
    const r = await importSharedExercises(decodeExercises(encodeExercises([ex('Row')])));
    expect(r.added).toBe(1);
  });
});

describe('głowy barków we własnym ćwiczeniu w linku', () => {
  it('własne ćwiczenie z głowami przechodzi przez link, stary link bez głów też się czyta', () => {
    const withHeads = ex('Boczne', { primaryMuscles: ['shoulders'], secondaryMuscles: [], delts: { primary: ['side'], secondary: ['front'] } });
    const [back] = decodeExercises(encodeExercises([withHeads]));
    expect(back.delts).toEqual({ primary: ['side'], secondary: ['front'] });
    expect(back.measure).toBeUndefined();
    const [plain] = decodeExercises(encodeExercises([ex('Zwykłe')]));
    expect(plain.delts).toBeUndefined();
    const old = LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, t: 'x', x: [['Stare', ['shoulders'], [], null, 'strength']] }));
    expect(decodeExercises(old)).toEqual([{ name: 'Stare', primaryMuscles: ['shoulders'], secondaryMuscles: [], equipment: null, category: 'strength' }]);
  });

  it('śmieci w głowach są ignorowane, import zapisuje głowy', async () => {
    const junk = LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, t: 'x', x: [['A', ['shoulders'], [], null, 'strength', 'reps', { primary: ['top', 'rear'], secondary: 5 }]] }));
    expect(decodeExercises(junk)[0].delts).toEqual({ primary: ['rear'], secondary: [] });
    const [item] = decodeExercises(encodeExercises([ex('B', { delts: { primary: ['rear'], secondary: [] } })]));
    await importSharedExercises([item]);
    expect((await db.exercises.filter((e) => e.name === 'B').first())?.delts).toEqual({ primary: ['rear'], secondary: [] });
  });
});
