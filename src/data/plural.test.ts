import { describe, it, expect } from 'vitest';
import { setsLabel, exercisesLabel, daysLabel, workingSetsLabel, workoutsLabel } from './plural';

describe('setsLabel', () => {
  it('uses the correct Polish plural form', () => {
    expect(setsLabel(1)).toBe('1 seria');
    expect(setsLabel(2)).toBe('2 serie');
    expect(setsLabel(5)).toBe('5 serii');
    expect(setsLabel(12)).toBe('12 serii');
    expect(setsLabel(22)).toBe('22 serie');
    expect(setsLabel(112)).toBe('112 serii');
  });
});

describe('exercisesLabel', () => {
  it('uses the correct Polish plural form', () => {
    expect(exercisesLabel(1)).toBe('1 ćwiczenie');
    expect(exercisesLabel(3)).toBe('3 ćwiczenia');
    expect(exercisesLabel(5)).toBe('5 ćwiczeń');
  });
});

describe('daysLabel', () => {
  it('uses the correct Polish plural form', () => {
    expect(daysLabel(1)).toBe('1 dzień');
    expect(daysLabel(2)).toBe('2 dni');
  });
});

describe('workingSetsLabel', () => {
  it('uses the correct Polish plural form', () => {
    expect(workingSetsLabel(1)).toBe('1 seria robocza');
    expect(workingSetsLabel(3)).toBe('3 serie robocze');
    expect(workingSetsLabel(5)).toBe('5 serii roboczych');
  });
});

describe('workoutsLabel', () => {
  it('uses the correct Polish plural form', () => {
    expect(workoutsLabel(22)).toBe('22 treningi');
  });
});
