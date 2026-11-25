import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createCustomExercise, filterExercises, seedExercises, updateCustomExercise } from './exercises';
import { exerciseMuscleLabels, muscleLabel } from './exerciseLabels';
import { bodyPartsOf } from './muscleMap';
import { periodRange, computeStats, type StatsInput } from './stats';
import { rankForSwap, swapMuscles } from './swapRank';
import type { Exercise, Workout, WorkoutSet } from './types';

const ex = (id: string, primary: string[], delts?: Exercise['delts'], equipment: string | null = null): Exercise =>
  ({ id, name: id, primaryMuscles: primary, secondaryMuscles: [], equipment, images: [], delts }) as unknown as Exercise;

describe('filtr głów barków', () => {
  const list = [
    ex('Face_Pull', ['shoulders'], { primary: ['rear'], secondary: [] }),
    ex('Side_Lateral_Raise', ['shoulders'], { primary: ['side'], secondary: [] }),
    ex('Custom', ['shoulders']),
    ex('Curl', ['biceps']),
  ];
  it('shoulders:rear znajduje Face Pull, nie boczne unoszenie ani własne bez głów', () => {
    expect(filterExercises(list, { muscle: 'shoulders:rear' }).map((e) => e.id)).toEqual(['Face_Pull']);
  });
  it('shoulders znajduje wszystkie barkowe', () => {
    expect(filterExercises(list, { muscle: 'shoulders' }).map((e) => e.id)).toEqual(['Custom', 'Face_Pull', 'Side_Lateral_Raise']);
  });
  it('etykiety', () => {
    expect(muscleLabel('shoulders:rear')).toBe('Barki — tył');
    expect(exerciseMuscleLabels(list[1], 'primary')).toEqual(['Barki — bok']);
    expect(exerciseMuscleLabels(list[2], 'primary')).toEqual(['Barki']);
  });
});

describe('zamiana: głowy barków', () => {
  const list = [
    ex('a-front', ['shoulders'], { primary: ['front'], secondary: [] }, 'dumbbell'),
    ex('b-press', ['shoulders']),
    ex('c-side-cable', ['shoulders'], { primary: ['side'], secondary: [] }, 'cable'),
    ex('d-curl', ['biceps']),
  ];
  const replaced = { primaryMuscles: ['shoulders'], secondaryMuscles: [], equipment: 'dumbbell', delts: { primary: ['side' as const], secondary: [] } };
  it('ta sama głowa przed innymi barkowymi, potem reszta', () => {
    const { similar, rest } = rankForSwap(list, replaced);
    expect(similar.map((e) => e.id)).toEqual(['c-side-cable', 'a-front', 'b-press']);
    expect(rest.map((e) => e.id)).toEqual(['d-curl']);
    expect(swapMuscles(replaced)).toEqual(['shoulders:side']);
  });
});

describe('sylwetka: głowy barków', () => {
  it('przód i bok → przednie, tył → tylne, bez głów oba', () => {
    expect(bodyPartsOf(['shoulders'], ['front'])).toEqual(['front-deltoids']);
    expect(bodyPartsOf(['shoulders'], ['side'])).toEqual(['front-deltoids']);
    expect(bodyPartsOf(['shoulders'], ['rear'])).toEqual(['back-deltoids']);
    expect(bodyPartsOf(['shoulders'], []).sort()).toEqual(['back-deltoids', 'front-deltoids']);
    expect(bodyPartsOf(['chest', 'shoulders'], ['side']).sort()).toEqual(['chest', 'front-deltoids']);
  });
});

describe('statystyki: podział barków', () => {
  const w: Workout = { id: 'w', name: 'T', startedAt: new Date(2026, 10, 17, 10).getTime(), endedAt: new Date(2026, 10, 17, 11).getTime(), source: 'app' };
  const set = (id: string, exerciseId: string): WorkoutSet =>
    ({ id, workoutId: 'w', exerciseId, exerciseOrder: 0, setOrder: 0, weight: 5, reps: 10, warmup: false, completedAt: w.startedAt }) as WorkoutSet;
  const input: StatsInput = {
    workouts: [w],
    sets: [set('1', 'side'), set('2', 'side'), set('3', 'rear'), set('4', 'unknown'), set('5', 'bench')],
    muscles: new Map([
      ['side', { primary: ['shoulders'], secondary: [], delts: { primary: ['side'], secondary: [] } }],
      ['rear', { primary: ['shoulders'], secondary: [], delts: { primary: ['rear'], secondary: [] } }],
      ['unknown', { primary: ['shoulders'], secondary: [] }],
      ['bench', { primary: ['chest'], secondary: ['shoulders'], delts: { primary: [], secondary: ['front'] } }],
    ]),
  };
  const s = computeStats(input, periodRange('week', 0, new Date(2026, 10, 18, 12).getTime()));
  it('główne: głowa + nieokreślone, suma Barki bez zmian', () => {
    expect(s.shoulderHeads.primary).toEqual({ front: 0, side: 2, rear: 1, unknown: 1 });
    expect(s.byGroup.primary.barki).toBe(4);
  });
  it('pomocnicze', () => {
    expect(s.shoulderHeads.secondary).toEqual({ front: 1, side: 0, rear: 0, unknown: 0 });
    expect(s.byGroup.secondary.barki).toBe(1);
  });
});

describe('własne ćwiczenie z głowami', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await seedExercises();
  });
  it('głowy w główne gdy Barki główne, w pomocnicze gdy pomocnicze, brak → brak delts', async () => {
    const a = await createCustomExercise({ name: 'A', primaryMuscles: ['shoulders'], secondaryMuscles: [], equipment: null, deltHeads: ['side'] });
    expect(a.delts).toEqual({ primary: ['side'], secondary: [] });
    const b = await createCustomExercise({ name: 'B', primaryMuscles: ['chest'], secondaryMuscles: ['shoulders'], equipment: null, deltHeads: ['front', 'side'] });
    expect(b.delts).toEqual({ primary: [], secondary: ['front', 'side'] });
    const c = await createCustomExercise({ name: 'C', primaryMuscles: ['shoulders'], secondaryMuscles: [], equipment: null });
    expect(c.delts).toBeUndefined();
    await updateCustomExercise(a.id, { name: 'A', primaryMuscles: ['shoulders'], secondaryMuscles: [], equipment: null, deltHeads: [] });
    expect((await db.exercises.get(a.id))?.delts).toBeUndefined();
  });
});
