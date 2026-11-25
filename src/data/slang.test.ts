import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { SLANG } from './slang';
import { filterExercises, matchedAlias, seedExercises, setUserNames, normalizeName } from './exercises';
import { PLAN_TEMPLATES as TEMPLATES } from './templates';
import { createBackup, restoreBackup } from './backup';
import type { Exercise } from './types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const all = async () => {
  await seedExercises();
  return db.exercises.toArray();
};

describe('slang siłowniany', () => {
  it('każde id slangu istnieje w katalogu, nazwy niepuste i bez powtórzeń w obrębie ćwiczenia', async () => {
    const ids = new Set((await all()).map((e) => e.id));
    for (const [id, names] of Object.entries(SLANG)) {
      expect(ids.has(id), id).toBe(true);
      expect(names.length, id).toBeGreaterThan(0);
      expect(new Set(names.map(normalizeName)).size, id).toBe(names.length);
    }
  }, 30000);

  it('"allah", "Allahy", "ALLAHY" znajdują Cable Crunch na pierwszym miejscu, z dopasowaną nazwą', async () => {
    const list = await all();
    for (const q of ['allah', 'Allahy', 'ALLAHY']) {
      const res = filterExercises(list, { query: q });
      expect(res[0]?.id, q).toBe('Cable_Crunch');
      expect(matchedAlias(res[0], q)).toMatch(/^Allah/);
    }
  }, 30000);

  it('francuz, OHP, spiętki, narciarz, żuraw, wiosło', async () => {
    const list = await all();
    const first = (q: string) => filterExercises(list, { query: q })[0]?.id;
    expect(first('francuz')).toBe('Lying_Triceps_Press');
    expect(first('ohp')).toBe('Standing_Military_Press');
    expect(first('spiętki')).toBe('Barbell_Shrug');
    expect(first('narciarz')).toBe('og-7557');
    expect(first('zurawie')).toBe('x-nordic-hamstring-curl');
    // Slang only adds matches: "wiosło" still lists ordinary rows too.
    const rows = filterExercises(list, { query: 'wiosło' });
    expect(rows[0].id).toBe('Bent_Over_Barbell_Row');
    expect(rows.length).toBeGreaterThan(10);
  }, 30000);

  it('nazwa własna ćwiczenia nie pokazuje się jako dopasowany alias', async () => {
    const list = await all();
    const bench = list.find((e) => e.id === 'Barbell_Bench_Press_-_Medium_Grip')!;
    expect(matchedAlias(bench, 'bench press')).toBeNull();
    expect(matchedAlias(bench, 'klata')).toBe('Klata');
  }, 30000);

  it('szablony: "Allahy" (Cable_Crunch) jest w szablonach FBW', () => {
    const ids = TEMPLATES.flatMap((t) => t.days.flatMap((d) => d.items.map((i) => i.exerciseId)));
    expect(ids).toContain('Cable_Crunch');
    expect(SLANG.Cable_Crunch).toContain('Allahy');
  });
});

describe('inne nazwy użytkownika', () => {
  it('zapis, przycinanie, bez duplikatów, wyszukiwanie; pusta lista usuwa pole', async () => {
    await all();
    await setUserNames('Hammer_Curls', ['  kopytka ', 'Kopytka', 'młotki Bartka']);
    let ex = (await db.exercises.get('Hammer_Curls'))!;
    expect(ex.userNames).toEqual(['kopytka', 'młotki Bartka']);
    expect(filterExercises([ex], { query: 'kopytk' }).map((e) => e.id)).toEqual(['Hammer_Curls']);
    expect(matchedAlias(ex, 'kopytka')).toBe('kopytka');
    await setUserNames('Hammer_Curls', []);
    ex = (await db.exercises.get('Hammer_Curls'))!;
    expect(ex.userNames).toBeUndefined();
  }, 30000);

  it('zostają po ponownym seedzie i przechodzą przez kopię zapasową', async () => {
    await all();
    await setUserNames('Hammer_Curls', ['kopytka']);
    const custom: Exercise = {
      id: 'custom-1', name: 'Moje', primaryMuscles: ['biceps'], secondaryMuscles: [], equipment: null,
      category: 'strength', instructions: [], images: [], custom: true, userNames: ['moje inne'],
    };
    await db.exercises.put(custom);
    await db.settings.update('app', { exerciseDbVersion: 1 });
    await seedExercises();
    expect((await db.exercises.get('Hammer_Curls'))!.userNames).toEqual(['kopytka']);

    const backup = await createBackup();
    await setUserNames('Hammer_Curls', []);
    await db.exercises.delete('custom-1');
    await restoreBackup(JSON.parse(JSON.stringify(backup)));
    expect((await db.exercises.get('Hammer_Curls'))!.userNames).toEqual(['kopytka']);
    expect((await db.exercises.get('custom-1'))!.userNames).toEqual(['moje inne']);
  }, 60000);
});
