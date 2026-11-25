import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import {
  EXERCISE_DB_VERSION,
  seedExercises,
  filterExercises,
  getRecentExerciseIds,
  getTips,
  saveNote,
  createCustomExercise,
  updateCustomExercise,
  deleteCustomExercise,
  type RawExercise,
  pickInstructions,
} from './exercises';
import { getSettings } from './settings';
import type { Workout, WorkoutSet, Plan } from './types';

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const RAW_BARBELL_SQUAT: RawExercise = {
  id: 'Barbell_Squat',
  name: 'Barbell Squat',
  force: 'push',
  level: 'beginner',
  mechanic: 'compound',
  equipment: 'barbell',
  primaryMuscles: ['quadriceps'],
  secondaryMuscles: ['glutes', 'hamstrings'],
  instructions: ['Stand with the bar on your upper back.'],
  category: 'strength',
  images: ['Barbell_Squat/0.jpg', 'Barbell_Squat/1.jpg'],
};

const RAW_BENCH_PRESS: RawExercise = {
  id: 'Barbell_Bench_Press_-_Medium_Grip',
  name: 'Barbell Bench Press - Medium Grip',
  force: 'push',
  level: 'beginner',
  mechanic: 'compound',
  equipment: 'barbell',
  primaryMuscles: ['chest'],
  secondaryMuscles: ['shoulders', 'triceps'],
  instructions: ['Lie back on a flat bench.'],
  category: 'strength',
  images: [],
};

const RAW_BICEP_CURL: RawExercise = {
  id: 'Dumbbell_Bicep_Curl',
  name: 'Dumbbell Bicep Curl',
  force: 'pull',
  level: 'beginner',
  mechanic: 'isolation',
  equipment: 'dumbbell',
  primaryMuscles: ['biceps'],
  secondaryMuscles: ['forearms'],
  instructions: ['Stand up with your dumbbells.'],
  category: 'strength',
  images: [],
};

const SAMPLE_RAW: RawExercise[] = [
  RAW_BARBELL_SQUAT,
  RAW_BENCH_PRESS,
  RAW_BICEP_CURL,
];

const loader = async (): Promise<RawExercise[]> => SAMPLE_RAW;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await db.delete();
  await db.open();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('exercises', () => {
  it('seed wstawia ćwiczenia z bazy i zapisuje wersję', async () => {
    await seedExercises(loader);

    const count = await db.exercises.count();
    expect(count).toBe(3);

    const settings = await getSettings();
    expect(settings.exerciseDbVersion).toBe(EXERCISE_DB_VERSION);

    const squat = await db.exercises.get('Barbell_Squat');
    expect(squat?.custom).toBe(false);
  });

  it('drugi seed nie dubluje i nie rusza własnych ćwiczeń ani notatek', async () => {
    // First seed
    await seedExercises(loader);

    // Add a custom exercise
    const custom = await createCustomExercise({
      name: 'Moje ćwiczenie',
      primaryMuscles: ['chest'],
      secondaryMuscles: [],
      equipment: null,
    });

    // Add a note for it
    await saveNote(custom.id, 'Moja notatka');

    // Force a re-seed by clearing the settings version
    await db.settings.clear();

    // Second seed
    await seedExercises(loader);

    const count = await db.exercises.count();
    expect(count).toBe(4); // 3 from db + 1 custom

    const stillCustom = await db.exercises.get(custom.id);
    expect(stillCustom).toBeDefined();
    expect(stillCustom?.custom).toBe(true);

    const note = await db.notes.get(custom.id);
    expect(note?.text).toBe('Moja notatka');
  });

  it('filtr: wielkość liter, kolejność słów, myślniki', async () => {
    await seedExercises(loader);
    const all = await db.exercises.toArray();

    const result1 = filterExercises(all, { query: '  PRESS bench ' });
    expect(result1.some((e) => e.id === 'Barbell_Bench_Press_-_Medium_Grip')).toBe(true);

    const result2 = filterExercises(all, { query: 'medium-grip' });
    expect(result2.some((e) => e.id === 'Barbell_Bench_Press_-_Medium_Grip')).toBe(true);
  });

  it('filtr mięśni obejmuje mięśnie pomocnicze; filtr sprzętu', async () => {
    await seedExercises(loader);
    const all = await db.exercises.toArray();

    // triceps is a secondary muscle of Bench Press
    const byMuscle = filterExercises(all, { muscle: 'triceps' });
    expect(byMuscle.some((e) => e.id === 'Barbell_Bench_Press_-_Medium_Grip')).toBe(true);

    // barbell equipment should exclude dumbbell exercises
    const byEquipment = filterExercises(all, { equipment: 'barbell' });
    expect(byEquipment.some((e) => e.id === 'Dumbbell_Bicep_Curl')).toBe(false);
    expect(byEquipment.length).toBeGreaterThan(0);

    // Results sorted by name
    const names = byEquipment.map((e) => e.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('ostatnio używane: najnowszy trening pierwszy, bez powtórzeń, limit', async () => {
    await seedExercises(loader);

    const workout1Id = crypto.randomUUID();
    const workout2Id = crypto.randomUUID();

    const now = Date.now();
    const workouts: Workout[] = [
      { id: workout1Id, name: 'W1', startedAt: now - 2000, source: 'app' },
      { id: workout2Id, name: 'W2', startedAt: now - 1000, source: 'app' },
    ];
    await db.workouts.bulkAdd(workouts);

    const sets: WorkoutSet[] = [
      {
        id: crypto.randomUUID(),
        workoutId: workout1Id,
        exerciseId: 'Barbell_Squat',
        exerciseOrder: 0,
        setOrder: 0,
        weight: 100,
        reps: 5,
        warmup: false,
      },
      {
        id: crypto.randomUUID(),
        workoutId: workout2Id,
        exerciseId: 'Dumbbell_Bicep_Curl',
        exerciseOrder: 0,
        setOrder: 0,
        weight: 15,
        reps: 10,
        warmup: false,
      },
      {
        id: crypto.randomUUID(),
        workoutId: workout2Id,
        exerciseId: 'Barbell_Squat',
        exerciseOrder: 1,
        setOrder: 0,
        weight: 100,
        reps: 5,
        warmup: false,
      },
    ];
    await db.sets.bulkAdd(sets);

    const recent = await getRecentExerciseIds(8);

    // Most recent workout (W2) first: Dumbbell_Bicep_Curl then Barbell_Squat (no repeat)
    expect(recent[0]).toBe('Dumbbell_Bicep_Curl');
    expect(recent[1]).toBe('Barbell_Squat');
    expect(recent).toHaveLength(2); // no duplicates
  });

  it('notatka: zapis, nadpisanie, pusta usuwa', async () => {
    await saveNote('Barbell_Squat', 'Pierwsza notatka');
    let note = await db.notes.get('Barbell_Squat');
    expect(note?.text).toBe('Pierwsza notatka');

    await saveNote('Barbell_Squat', 'Druga notatka');
    note = await db.notes.get('Barbell_Squat');
    expect(note?.text).toBe('Druga notatka');

    // Empty (after trim) deletes the row
    await saveNote('Barbell_Squat', '   ');
    note = await db.notes.get('Barbell_Squat');
    expect(note).toBeUndefined();
  });

  it('własne ćwiczenie: walidacja nazwy i mięśni, tworzenie, edycja', async () => {
    // Validation errors
    await expect(
      createCustomExercise({ name: '', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: null }),
    ).rejects.toThrow('Podaj nazwę');

    await expect(
      createCustomExercise({ name: 'Test', primaryMuscles: [], secondaryMuscles: [], equipment: null }),
    ).rejects.toThrow('Wybierz co najmniej jeden mięsień');

    // Create
    const ex = await createCustomExercise({
      name: 'Wiosło',
      primaryMuscles: ['lats'],
      secondaryMuscles: ['biceps'],
      equipment: 'barbell',
    });

    expect(ex.id).toMatch(/^custom-/);
    expect(ex.custom).toBe(true);
    expect(ex.category).toBe('strength');
    expect(ex.name).toBe('Wiosło');

    const stored = await db.exercises.get(ex.id);
    expect(stored).toBeDefined();

    // Edit
    await updateCustomExercise(ex.id, {
      name: 'Wiosło sztangą',
      primaryMuscles: ['lats', 'middle back'],
      secondaryMuscles: ['biceps'],
      equipment: 'barbell',
    });

    const updated = await db.exercises.get(ex.id);
    expect(updated?.name).toBe('Wiosło sztangą');
    expect(updated?.primaryMuscles).toContain('middle back');
  });

  it('usuwanie własnego: odmowa gdy użyte w serii lub planie, inaczej usuwa też notatkę', async () => {
    const ex = await createCustomExercise({
      name: 'Custom Push',
      primaryMuscles: ['chest'],
      secondaryMuscles: [],
      equipment: null,
    });

    await saveNote(ex.id, 'Notatka do usunięcia');

    // --- Refuse when used in a set ---
    const workoutId = crypto.randomUUID();
    await db.workouts.add({ id: workoutId, name: 'W', startedAt: Date.now(), source: 'app' });
    const setId = crypto.randomUUID();
    const set: WorkoutSet = {
      id: setId,
      workoutId,
      exerciseId: ex.id,
      exerciseOrder: 0,
      setOrder: 0,
      weight: 50,
      reps: 10,
      warmup: false,
    };
    await db.sets.add(set);

    const refusedBySet = await deleteCustomExercise(ex.id);
    expect(refusedBySet.ok).toBe(false);

    // --- Refuse when used in a plan ---
    await db.sets.delete(setId);

    const plan: Plan = {
      id: crypto.randomUUID(),
      name: 'Plan testowy',
      startedAt: '2026-01-01',
      days: [
        {
          id: crypto.randomUUID(),
          name: 'Dzień A',
          items: [
            {
              exerciseId: ex.id,
              sets: 3,
              warmupSets: 1,
              repsMin: 8,
              repsMax: 12,
              restSec: 90,
            },
          ],
        },
      ],
    };
    await db.plans.add(plan);

    const refusedByPlan = await deleteCustomExercise(ex.id);
    expect(refusedByPlan.ok).toBe(false);
    if (!refusedByPlan.ok) {
      expect(refusedByPlan.reason).toBe(
        'Ćwiczenie jest używane w planie lub historii treningów.',
      );
    }

    // --- Success: delete exercise and its note ---
    await db.plans.clear();

    const deleted = await deleteCustomExercise(ex.id);
    expect(deleted.ok).toBe(true);

    expect(await db.exercises.get(ex.id)).toBeUndefined();
    expect(await db.notes.get(ex.id)).toBeUndefined();
  });
});

describe('rady po polsku', () => {
  it('rady: każdy klucz istnieje w bazie i ma 2–5 rad', async () => {
    const tipsData = (await import('./tips-pl.json')).default as Record<string, string[]>;
    const dbIds = new Set(((await import('./exercise-db.json')).default as RawExercise[]).map((e) => e.id));
    const keys = Object.keys(tipsData);
    expect(keys.length).toBeGreaterThanOrEqual(40);
    for (const key of keys) {
      expect(dbIds.has(key), key).toBe(true);
      expect(tipsData[key].length, key).toBeGreaterThanOrEqual(2);
      expect(tipsData[key].length, key).toBeLessThanOrEqual(5);
      for (const tip of tipsData[key]) expect(tip.trim(), key).not.toBe('');
    }
    expect(getTips('Barbell_Squat').length).toBeGreaterThan(0);
  });
});

describe('instrukcje po polsku', () => {
  it('polska instrukcja zamiast angielskiej, angielska gdy brak lub niepełna', () => {
    const ex = { id: 'Barbell_Squat', instructions: ['Step one.', 'Step two.'] };
    expect(pickInstructions(ex, { Barbell_Squat: ['Krok pierwszy.', 'Krok drugi.'] })).toEqual(['Krok pierwszy.', 'Krok drugi.']);
    expect(pickInstructions(ex, {})).toEqual(ex.instructions);
    expect(pickInstructions(ex, { Barbell_Squat: ['Tylko jeden krok.'] })).toEqual(ex.instructions);
    expect(pickInstructions(ex, null)).toEqual(ex.instructions);
    expect(pickInstructions({ id: 'X', instructions: ['A.', '', 'B.'] }, { X: ['A pl.', '', 'B pl.'] })).toEqual(['A pl.', 'B pl.']);
  });

  it('tłumaczenie obejmuje całą bazę, z tą samą liczbą kroków', async () => {
    const pl = (await import('./instructions-pl.json')).default as Record<string, string[]>;
    const raw = (await import('./exercise-db.json')).default as RawExercise[];
    const withSteps = raw.filter((e) => e.instructions.length > 0);
    const missing = withSteps.filter((e) => pl[e.id]?.length !== e.instructions.length).map((e) => e.id);
    expect(missing).toEqual([]);
    // A Polish step may be blank only where the upstream English step is blank.
    for (const e of withSteps) pl[e.id].forEach((step, i) => expect(step.trim() === '', e.id).toBe(e.instructions[i].trim() === ''));
  });
});

describe('dodatkowe ćwiczenia (wersja 4 bazy)', () => {
  it('istniejący użytkownik z wersją 1 dostaje nowe ćwiczenia; notatki, własne, historia i krok ciężaru zostają', async () => {
    const { db } = await import('./db');
    const { updateSettings } = await import('./settings');
    const { EXTRA_EXERCISES, EXERCISE_DB_VERSION } = await import('./exercises');
    await db.exercises.put({ ...fromDbForTest('Butterfly'), weightStep: 5, measureOverride: 'time' });
    await db.exercises.put({ ...fromDbForTest('Plank'), measure: undefined });
    await db.exercises.put({ id: 'custom-1', name: 'Wiosło Krzywe', primaryMuscles: [], secondaryMuscles: [], equipment: null, category: 'strength', instructions: [], images: [], custom: true });
    await db.notes.put({ exerciseId: 'Butterfly', text: 'siedzenie 4', updatedAt: 1 });
    await db.sets.put({ id: 's1', workoutId: 'w1', exerciseId: 'Butterfly', exerciseOrder: 0, setOrder: 0, weight: 40, reps: 10, warmup: false, completedAt: 1 });
    await updateSettings({ exerciseDbVersion: 1 });

    await seedExercises();

    expect(EXERCISE_DB_VERSION).toBe(7);
    expect((await db.settings.get('app'))?.exerciseDbVersion).toBe(EXERCISE_DB_VERSION);
    const fly = (await db.exercises.get('Butterfly'))!;
    expect(fly.weightStep).toBe(5);
    expect(fly.measureOverride).toBe('time'); // the user's choice survives the reseed
    expect(fly.measure).toBeUndefined();
    expect((await db.exercises.get('Plank'))?.measure).toBe('time'); // built-in default from exercise-measure.json
    expect(fly.aka).toContain('Pec Deck');
    expect(await db.exercises.get('custom-1')).toBeDefined();
    expect((await db.notes.get('Butterfly'))?.text).toBe('siedzenie 4');
    expect(await db.sets.count()).toBe(1);
    const lying = await db.exercises.get('x-lying-chest-press-machine');
    expect(lying).toMatchObject({ name: 'Lying Chest Press Machine', custom: false, equipment: 'machine', images: [] });
    const og = (await import('./exercises-og.json')).default as unknown as { added: unknown[]; merged: Record<string, string> };
    const extrasKept = EXTRA_EXERCISES.filter((e) => !og.merged[e.id]).length;
    expect(await db.exercises.count()).toBe(876 + extrasKept + og.added.length + 1);
    // openGym: Polish names on existing exercises and new og- exercises
    expect((await db.exercises.get('Barbell_Bench_Press_-_Medium_Grip'))?.namePl).toBe('Wyciskanie sztangi na ławce płaskiej');
    // og-1041 duplicates our Lying Chest Press Machine: merged into it, its names kept for search
    expect(await db.exercises.get('og-1041')).toBeUndefined();
    const lyingPress = (await db.exercises.get('x-lying-chest-press-machine'))!;
    expect(lyingPress.aka).toContain('Lever Lying Chest Press (Plate Loaded)');
    expect(lyingPress.namePl).toMatch(/^Wyciskanie w leżeniu/);
    expect(await db.exercises.get('og-0002')).toMatchObject({ custom: false, images: [] });
  });

  it('dodatkowe ćwiczenia: unikalne id x-, nazwy nie dublują bazy, mięśnie ze słownika bazy, polskie kroki i rady', async () => {
    const { EXTRA_EXERCISES } = await import('./exercises');
    const raw = (await import('./exercise-db.json')).default as { name: string; primaryMuscles: string[]; secondaryMuscles: string[]; equipment: string | null }[];
    const muscles = new Set(raw.flatMap((e) => [...e.primaryMuscles, ...e.secondaryMuscles]));
    const equipment = new Set(raw.map((e) => e.equipment));
    const names = new Set(raw.map((e) => e.name.toLowerCase()));
    expect(new Set(EXTRA_EXERCISES.map((e) => e.id)).size).toBe(EXTRA_EXERCISES.length);
    for (const e of EXTRA_EXERCISES) {
      expect(e.id).toMatch(/^x-[a-z0-9-]+$/);
      expect(names.has(e.name.toLowerCase()), e.name).toBe(false);
      expect(e.primaryMuscles.length, e.name).toBeGreaterThan(0);
      for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) expect(muscles.has(m), `${e.name}: ${m}`).toBe(true);
      expect(equipment.has(e.equipment), e.name).toBe(true);
      expect(e.instructions.length, e.name).toBeGreaterThanOrEqual(3);
      expect(e.tips.length, e.name).toBeGreaterThanOrEqual(2);
      expect(getTips(e.id)).toEqual(e.tips);
    }
  });

  it('inne nazwy wskazują istniejące ćwiczenia i nie powtarzają się', async () => {
    const aka = (await import('./exercise-aka.json')).default as Record<string, { aka?: string[]; similar?: string[]; maybe?: string[] }>;
    const { EXTRA_EXERCISES } = await import('./exercises');
    const raw = (await import('./exercise-db.json')).default as { name: string }[];
    const all = new Set([...raw, ...EXTRA_EXERCISES].map((e) => e.name));
    const seen = new Set<string>();
    for (const [name, v] of Object.entries(aka)) {
      expect(all.has(name), name).toBe(true);
      for (const n of [...(v.aka ?? []), ...(v.similar ?? []), ...(v.maybe ?? [])]) {
        const k = n.toLowerCase();
        expect(seen.has(k), n).toBe(false);
        expect(all.has(n), `${n} is already an exercise name`).toBe(false);
        seen.add(k);
      }
    }
  });
});

describe('duplikaty (wersja 4)', () => {
  it('użytkownik z wersją 3: serie, plan, trening, notatka i alias z usuniętego duplikatu przechodzą na zachowane ćwiczenie', async () => {
    const { db } = await import('./db');
    const { updateSettings } = await import('./settings');
    const og = (await import('./exercises-og.json')).default as unknown as { merged: Record<string, string> };
    const [from, to] = Object.entries(og.merged).find(([f, t]) => f.startsWith('og-') && !t.startsWith('og-'))!;
    await db.exercises.put({ ...fromDbForTest('Dup'), id: from });
    await db.sets.put({ id: 's1', workoutId: 'w1', exerciseId: from, exerciseOrder: 0, setOrder: 0, weight: 40, reps: 10, warmup: false, completedAt: 1 });
    await db.workouts.put({ id: 'w1', name: 'T', startedAt: 1, endedAt: 2, source: 'app', exercises: [{ exerciseId: from, warmupSets: 0, sets: 1, repsMin: 8, repsMax: 12, restSec: 90 }] });
    await db.plans.put({ id: 'p1', name: 'P', startedAt: '2026-11-01', days: [{ id: 'd1', name: 'A', items: [{ exerciseId: from, warmupSets: 0, sets: 3, repsMin: 8, repsMax: 12, restSec: 90 }] }] });
    await db.notes.put({ exerciseId: from, text: 'ustawienie 3', updatedAt: 1 });
    await db.aliases.put({ sourceName: 'Stara nazwa', exerciseId: from });
    await updateSettings({ exerciseDbVersion: 3 });

    await seedExercises();

    expect(await db.exercises.get(from)).toBeUndefined();
    expect(await db.exercises.get(to)).toBeDefined();
    expect((await db.sets.get('s1'))?.exerciseId).toBe(to);
    expect((await db.workouts.get('w1'))?.exercises?.[0].exerciseId).toBe(to);
    expect((await db.plans.get('p1'))?.days[0].items[0].exerciseId).toBe(to);
    expect((await db.notes.get(to))?.text).toContain('ustawienie 3');
    expect(await db.notes.get(from)).toBeUndefined();
    expect((await db.aliases.get('Stara nazwa'))?.exerciseId).toBe(to);
  });

  it('nazwy scalonych duplikatów są wyszukiwalne przy zachowanym ćwiczeniu; zdublowane własne x- znika', async () => {
    const { db } = await import('./db');
    await seedExercises();
    expect(await db.exercises.get('x-cable-front-raise')).toBeUndefined();
    const kept = (await db.exercises.get('Front_Cable_Raise'))!;
    expect(kept.aka).toContain('Cable Front Raise');
    expect(filterExercises([kept], { query: 'cable front raise' })).toHaveLength(1);
  });
});

describe('katalog openGym', () => {
  it('id og-, słownik mięśni i sprzętu jak w bazie, nazwy nie dublują bazy, kroki niepuste', async () => {
    const og = (await import('./exercises-og.json')).default as unknown as {
      added: { id: string; name: string; namePl?: string; equipment: string; category: string; primaryMuscles: string[]; secondaryMuscles: string[]; instructions: string[]; images: string[] }[];
    };
    const raw = (await import('./exercise-db.json')).default as { name: string; primaryMuscles: string[]; secondaryMuscles: string[]; equipment: string | null; category: string }[];
    const muscles = new Set(raw.flatMap((e) => [...e.primaryMuscles, ...e.secondaryMuscles]));
    const equipment = new Set(raw.map((e) => e.equipment));
    const categories = new Set(raw.map((e) => e.category));
    const names = new Set(raw.map((e) => e.name.toLowerCase()));
    expect(og.added.length).toBeGreaterThan(3000);
    expect(new Set(og.added.map((e) => e.id)).size).toBe(og.added.length);
    for (const e of og.added) {
      expect(e.id).toMatch(/^og-\d+$/);
      expect(names.has(e.name.toLowerCase()), e.name).toBe(false);
      for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) expect(muscles.has(m), `${e.name}: ${m}`).toBe(true);
      expect(equipment.has(e.equipment), e.name).toBe(true);
      expect(categories.has(e.category), e.name).toBe(true);
      expect(e.instructions.length, e.name).toBeGreaterThan(0);
      expect(e.images).toEqual([]);
    }
    expect(og.added.filter((e) => e.namePl).length / og.added.length).toBeGreaterThan(0.99);
  });

  it('szukanie po angielsku i po polsku, bez polskich znaków', () => {
    const list = [
      { id: 'a', name: 'Lever Seated Row', namePl: 'Wiosłowanie siedząc na maszynie', primaryMuscles: [], secondaryMuscles: [], equipment: 'machine', category: 'strength', instructions: [], images: [], custom: false },
      { id: 'b', name: 'Butterfly', aka: ['Pec Deck'], primaryMuscles: [], secondaryMuscles: [], equipment: 'machine', category: 'strength', instructions: [], images: [], custom: false },
    ];
    expect(filterExercises(list, { query: 'wioslowanie maszynie' }).map((e) => e.id)).toEqual(['a']);
    expect(filterExercises(list, { query: 'wiosłowanie maszyna' }).map((e) => e.id)).toEqual(['a']);
    expect(filterExercises(list, { query: 'seated row' }).map((e) => e.id)).toEqual(['a']);
    expect(filterExercises(list, { query: 'pec deck' }).map((e) => e.id)).toEqual(['b']);
  });
});

describe('rodzaj ćwiczenia (measure)', () => {
  it('custom exercise keeps measure on create and update; reps is stored as absent', async () => {
    const { updateCustomExercise } = await import('./exercises');
    const input = { name: 'Deska boczna', primaryMuscles: ['abdominals'], secondaryMuscles: [], equipment: null };
    const created = await createCustomExercise({ ...input, measure: 'time' });
    expect((await db.exercises.get(created.id))?.measure).toBe('time');
    await updateCustomExercise(created.id, { ...input, measure: 'distance' });
    expect((await db.exercises.get(created.id))?.measure).toBe('distance');
    await updateCustomExercise(created.id, { ...input, measure: 'reps' });
    expect((await db.exercises.get(created.id))?.measure).toBeUndefined();
    expect((await createCustomExercise({ ...input, name: 'Zwykłe' })).measure).toBeUndefined();
  });

  it('built-in measure comes from exercise-measure.json', async () => {
    const { fromDb } = await import('./exercises');
    const m = (await import('./exercise-measure.json')).default;
    const raw = (id: string) => ({ ...fromDbForTest(id), force: null, level: '', mechanic: null });
    expect(fromDb(raw('Plank')).measure).toBe('time');
    expect(fromDb(raw(m.distance[0])).measure).toBe('distance');
    expect(fromDb(raw(m.timeDistance[0])).measure).toBe('timeDistance');
    expect(fromDb(raw('Barbell_Curl')).measure).toBeUndefined();
  });
});

function fromDbForTest(name: string) {
  return { id: name, name, primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'machine', category: 'strength', instructions: [], images: [], custom: false };
}

describe('głowy barków (wersja 6)', () => {
  it('użytkownik z wersją 5: dane użytkownika bez zmian, wersja 6, Side_Lateral_Raise ma głowę boczną, własne ćwiczenia bez głów', async () => {
    const { updateSettings } = await import('./settings');
    await seedExercises();
    const custom = await createCustomExercise({ name: 'Moje boczne', primaryMuscles: ['shoulders'], secondaryMuscles: [], equipment: null });
    const w: Workout = { id: 'w1', name: 'Barki', startedAt: 1, endedAt: 2, source: 'app' };
    const sets: WorkoutSet[] = [
      { id: 's1', workoutId: 'w1', exerciseId: 'Side_Lateral_Raise', exerciseOrder: 0, setOrder: 0, weight: 8, reps: 12, warmup: false, completedAt: 1 },
      { id: 's2', workoutId: 'w1', exerciseId: custom.id, exerciseOrder: 1, setOrder: 0, weight: 5, reps: 10, warmup: false, completedAt: 2 },
    ];
    const plan: Plan = {
      id: 'p1',
      name: 'Plan',
      startedAt: '2026-11-01',
      days: [{ id: 'd1', name: 'Barki', items: [{ exerciseId: 'Side_Lateral_Raise', sets: 3, warmupSets: 0, repsMin: 10, repsMax: 15, restSec: 60 }] }],
    };
    await db.workouts.put(w);
    await db.sets.bulkPut(sets);
    await db.plans.put(plan);
    await db.notes.put({ exerciseId: 'Side_Lateral_Raise', text: 'lekko', updatedAt: 5 });
    // The old catalogue: version 5, no heads, a weight step the user chose.
    const old = (await db.exercises.get('Side_Lateral_Raise'))!;
    delete old.delts;
    await db.exercises.put({ ...old, weightStep: 1 });
    await updateSettings({ exerciseDbVersion: 5 });
    const before = {
      workouts: await db.workouts.toArray(),
      sets: await db.sets.toArray(),
      plans: await db.plans.toArray(),
      notes: await db.notes.toArray(),
      custom: await db.exercises.get(custom.id),
    };

    await seedExercises();

    expect(await db.workouts.toArray()).toEqual(before.workouts);
    expect(await db.sets.toArray()).toEqual(before.sets);
    expect(await db.plans.toArray()).toEqual(before.plans);
    expect(await db.notes.toArray()).toEqual(before.notes);
    expect(await db.exercises.get(custom.id)).toEqual(before.custom);
    expect((await db.exercises.get(custom.id))?.delts).toBeUndefined();
    expect((await db.settings.get('app'))?.exerciseDbVersion).toBe(EXERCISE_DB_VERSION);
    const side = (await db.exercises.get('Side_Lateral_Raise'))!;
    expect(side.delts?.primary).toEqual(['side']);
    expect(side.weightStep).toBe(1);
    expect((await db.exercises.get('Barbell_Squat'))?.delts).toBeUndefined();
  });
});
