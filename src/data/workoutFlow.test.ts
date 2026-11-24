import { describe, it, expect } from 'vitest';
import { nextAfterExerciseDone, isExerciseDone, setsWord } from './workoutFlow';

const p = (completed: number, total: number) => ({ completed, total });

describe('nextAfterExerciseDone', () => {
  it('next: idzie do następnego ćwiczenia z niezaliczonymi seriami', () => {
    expect(nextAfterExerciseDone([p(3, 3), p(0, 3), p(0, 3)], 0, 'next')).toEqual({ kind: 'exercise', index: 1 });
  });
  it('next: pomija ukończone ćwiczenia', () => {
    expect(nextAfterExerciseDone([p(3, 3), p(3, 3), p(1, 3)], 0, 'next')).toEqual({ kind: 'exercise', index: 2 });
  });
  it('next: wraca na początek, gdy dalej nic nie zostało', () => {
    expect(nextAfterExerciseDone([p(1, 3), p(3, 3), p(3, 3)], 2, 'next')).toEqual({ kind: 'exercise', index: 0 });
  });
  it('next: wszystko zrobione -> lista', () => {
    expect(nextAfterExerciseDone([p(3, 3), p(3, 3)], 1, 'next')).toEqual({ kind: 'list' });
    expect(nextAfterExerciseDone([p(3, 3)], 0, 'next')).toEqual({ kind: 'list' });
  });
  it('list: zawsze lista', () => {
    expect(nextAfterExerciseDone([p(3, 3), p(0, 3)], 0, 'list')).toEqual({ kind: 'list' });
  });
  it('stay: nic nie robi', () => {
    expect(nextAfterExerciseDone([p(3, 3), p(0, 3)], 0, 'stay')).toEqual({ kind: 'stay' });
  });
});

describe('helpers', () => {
  it('isExerciseDone', () => {
    expect(isExerciseDone(p(3, 3))).toBe(true);
    expect(isExerciseDone(p(2, 3))).toBe(false);
    expect(isExerciseDone(p(0, 0))).toBe(false);
  });
  it('setsWord', () => {
    expect([1, 2, 4, 5, 12, 22].map(setsWord)).toEqual(['seria', 'serie', 'serie', 'serii', 'serii', 'serie']);
  });
});
