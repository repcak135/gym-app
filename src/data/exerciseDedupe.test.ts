import { describe, expect, it } from 'vitest';
import { dedupeKey, dedupeTokens, exactGroups, nearPairs } from './exerciseDedupe';

const ex = (id: string, name: string, equipment = 'cable', muscle = 'lats') => ({ id, name, equipment, primaryMuscles: [muscle] });

describe('dedupe normalizer', () => {
  it('ignores case, punctuation, plural, word order, versions and "(plate loaded)"; unifies synonyms', () => {
    expect(dedupeTokens('Wide Grip Lat Pull Down')).toEqual(dedupeTokens('Wide-Grip Lat Pulldown'));
    expect(dedupeTokens('Lat Pulldowns, Wide Grip')).toEqual(dedupeTokens('wide grip lat pulldown'));
    expect(dedupeTokens('DB Bench Press')).toEqual(dedupeTokens('Dumbbell Bench Press'));
    expect(dedupeTokens('EZ Bar Curl')).toEqual(dedupeTokens('E-Z Curl Bar Curl'));
    expect(dedupeTokens('ez-bar curl')).toEqual(dedupeTokens('EZ Barbell Curl'));
    expect(dedupeTokens('Lever Seated Row (Plate Loaded)')).toEqual(dedupeTokens('Seated Row Machine'));
    expect(dedupeTokens('Smith Upright Row')).toEqual(dedupeTokens('Smith Machine Upright Row'));
    expect(dedupeTokens('Air Bike V. 2')).toEqual(dedupeTokens('Air Bike'));
    expect(dedupeTokens('One-Arm Lat Pulldown')).toEqual(dedupeTokens('Single Arm Lat Pulldown'));
    expect(dedupeTokens('Chin Ups')).toEqual(dedupeTokens('Chin-Up'));
  });

  it('keeps movement-changing words apart', () => {
    expect(dedupeTokens('Incline Dumbbell Press')).not.toEqual(dedupeTokens('Dumbbell Press'));
    expect(dedupeTokens('Close Grip Lat Pulldown')).not.toEqual(dedupeTokens('Wide Grip Lat Pulldown'));
    expect(dedupeTokens('Single Arm Cable Row')).not.toEqual(dedupeTokens('Cable Row'));
  });

  it('exact groups also need the same equipment and primary muscle', () => {
    const list = [ex('a', 'Lat Pull Down'), ex('b', 'Lat Pulldowns'), ex('c', 'Lat Pulldown', 'machine'), ex('d', 'Lat Pulldown', 'cable', 'biceps')];
    expect(exactGroups(list).map((g) => g.map((e) => e.id))).toEqual([['a', 'b']]);
    expect(dedupeKey(list[0])).toBe(dedupeKey(list[1]));
  });

  it('near pairs: names differing only by words that repeat the equipment', () => {
    const list = [
      ex('a', 'Straight-Arm Pulldown'), ex('b', 'Cable Straight Arm Pulldown'),
      ex('c', 'Cable Incline Pulldown'), ex('d', 'Lying Cable Pulldown'),
    ];
    const pairs = nearPairs(list).map(([x, y, w]) => [x.id, y.id, w]);
    expect(pairs).toEqual([['a', 'b', 'cable']]);
  });
});
