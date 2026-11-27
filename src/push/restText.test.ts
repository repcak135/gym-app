import { describe, expect, it } from 'vitest';
import { restPushBody, REST_PUSH_FALLBACK } from './restText';
import type { Workout, WorkoutSet } from '../data/types';

const ex = (exerciseId: string) => ({ exerciseId, warmupSets: 0, sets: 3, repsMin: 8, repsMax: 12, restSec: 90 });
const workout = (currentIndex: number): Workout => ({
  id: 'w', name: 'A', startedAt: 1, source: 'app', currentIndex, exercises: [ex('Bench'), ex('Squat')],
});
let n = 0;
const set = (exerciseId: string, exerciseOrder: number, setOrder: number, done: boolean, warmup = false): WorkoutSet =>
  ({ id: `s${n++}`, workoutId: 'w', exerciseId, exerciseOrder, setOrder, weight: 50, reps: 8, warmup, completedAt: done ? 5 : undefined }) as WorkoutSet;
const NAMES: Record<string, string> = { Bench: 'Wyciskanie sztangi na ławce płaskiej', Squat: 'Przysiad' };
const names = (id: string) => NAMES[id];

describe('restPushBody', () => {
  it('names the next working set of the current exercise', () => {
    const sets = [set('Bench', 0, 0, true, true), set('Bench', 0, 1, true), set('Bench', 0, 2, true), set('Bench', 0, 3, false)];
    expect(restPushBody(workout(0), sets, names)).toBe('Seria 3 · Wyciskanie sztangi na ławce płaskiej');
  });

  it('says Rozgrzewka for a warm-up set', () => {
    expect(restPushBody(workout(0), [set('Bench', 0, 0, false, true), set('Bench', 0, 1, false)], names)).toBe(
      'Rozgrzewka · Wyciskanie sztangi na ławce płaskiej',
    );
  });

  it('moves on to the next exercise when the current one is done', () => {
    expect(restPushBody(workout(0), [set('Bench', 0, 0, true), set('Squat', 1, 0, false)], names)).toBe('Seria 1 · Przysiad');
  });

  it('falls back when everything is done or the name is unknown, and survives a NaN index', () => {
    expect(restPushBody(workout(0), [set('Bench', 0, 0, true)], names)).toBe(REST_PUSH_FALLBACK);
    expect(restPushBody(workout(0), [set('X', 0, 0, false)], names)).toBe(REST_PUSH_FALLBACK);
    expect(restPushBody(workout(Number.NaN), [set('Squat', 1, 0, false)], names)).toBe('Seria 1 · Przysiad');
    expect(REST_PUSH_FALLBACK).toBe('Czas na kolejną serię');
  });
});
