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
