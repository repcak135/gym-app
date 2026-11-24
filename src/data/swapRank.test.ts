import { describe, expect, it } from 'vitest';
import type { Exercise } from './types';
import { rankForSwap } from './swapRank';

const ex = (id: string, primary: string[], equipment: string | null): Exercise =>
  ({ id, name: id, primaryMuscles: primary, secondaryMuscles: [], equipment, images: [] }) as unknown as Exercise;

describe('rankForSwap', () => {
  const list = [
    ex('a-curl', ['biceps'], 'dumbbell'),
    ex('b-press-machine', ['shoulders'], 'machine'),
    ex('c-lateral-db', ['shoulders'], 'dumbbell'),
    ex('d-squat', ['quadriceps'], 'barbell'),
    ex('e-rear-delt-db', ['shoulders'], 'dumbbell'),
    ex('f-front-raise-cable', ['shoulders'], 'cable'),
    ex('g-row-db', ['middle back'], 'dumbbell'),
  ];
  const replaced = { primaryMuscles: ['shoulders'], secondaryMuscles: [], equipment: 'dumbbell' };

  it('same muscle first, then same equipment, then used, keeping the list order on ties', () => {
    const { similar, rest } = rankForSwap(list, replaced, new Set(['f-front-raise-cable']));
    expect(similar.map((e) => e.id)).toEqual([
      'c-lateral-db', 'e-rear-delt-db', // same muscle + equipment
      'f-front-raise-cable',           // same muscle, used
      'b-press-machine',               // same muscle
    ]);
    expect(rest.map((e) => e.id)).toEqual(['a-curl', 'g-row-db', 'd-squat']);
  });

  it('keeps everything (search results are only reordered)', () => {
    const { similar, rest } = rankForSwap(list, replaced);
    expect(similar.length + rest.length).toBe(list.length);
  });

  it('no primary muscle: the secondary ones count', () => {
    const { similar } = rankForSwap(list, { primaryMuscles: [], secondaryMuscles: ['quadriceps'], equipment: null });
    expect(similar.map((e) => e.id)).toEqual(['d-squat']);
  });

  it('an exercise without muscles: nothing is "similar", equipment still ranks', () => {
    const { similar, rest } = rankForSwap(list, { primaryMuscles: [], secondaryMuscles: [], equipment: 'barbell' });
    expect(similar).toEqual([]);
    expect(rest[0].id).toBe('d-squat');
  });
});
