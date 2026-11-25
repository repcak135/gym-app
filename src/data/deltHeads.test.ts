import { describe, it, expect } from 'vitest';
import base from './exercise-db.json';
import extra from './exercises-extra.json';
import og from './exercises-og.json';
import { classifyDelts, deltChipLabel, deltHeadsOf, DELT_LABEL, type Delts } from './deltHeads';
import type { Exercise } from './types';

type Row = Pick<Exercise, 'id' | 'name' | 'equipment' | 'primaryMuscles' | 'secondaryMuscles'>;
const CATALOGUE = [...(base as Row[]), ...(extra as Row[]), ...(og as unknown as { added: Row[] }).added];
const byId = (id: string): Row => {
  const r = CATALOGUE.find((e) => e.id === id);
  if (!r) throw new Error(`no exercise ${id}`);
  return r;
};
const d = (primary: Delts['primary'], secondary: Delts['secondary'] = []): Delts => ({ primary, secondary });
const synth = (name: string, primary: string[], secondary: string[] = []): Row => ({
  id: `synthetic-${name}`,
  name,
  equipment: null,
  primaryMuscles: primary,
  secondaryMuscles: secondary,
});

describe('classifyDelts: katalog', () => {
  const cases: [string, Delts | undefined][] = [
    ['Side_Lateral_Raise', d(['side'])],
    ['Seated_Side_Lateral_Raise', d(['side'])],
    ['x-one-arm-cable-lateral-raise', d(['side'])],
    ['og-2924', d(['side'])], // Cable Side Lying Lateral Raise
    ['Face_Pull', d(['rear'])],
    ['Reverse_Flyes', d(['rear'])],
    ['Reverse_Machine_Flyes', d(['rear'])],
    ['Dumbbell_Lying_Rear_Lateral_Raise', d(['rear'])], // "rear" and "lateral": rear wins
    ['Seated_Bent-Over_Rear_Delt_Raise', d(['rear'])],
    ['Band_Pull_Apart', d(['rear'])],
    ['x-cable-y-raise', d(['rear'])],
    ['Standing_Military_Press', d(['front'], ['side'])],
    ['Push_Press', d(['front'], ['side'])],
    ['Dumbbell_Shoulder_Press', d(['front'], ['side'])],
    ['Machine_Shoulder_Military_Press', d(['front'], ['side'])],
    ['Standing_Dumbbell_Press', d(['front'], ['side'])], // generic "press" with shoulders primary
    ['x-landmine-press', d(['front'], ['side'])],
    ['Handstand_Push-Ups', d(['front'], ['side'])],
    ['Arnold_Dumbbell_Press', d(['front', 'side'])],
    ['Upright_Barbell_Row', d(['side'], ['front'])],
    ['Front_Dumbbell_Raise', d(['front'])],
    ['Front_Plate_Raise', d(['front'])],
    ['Barbell_Bench_Press_-_Medium_Grip', d([], ['front'])], // shoulders secondary on the real record
    ['Barbell_Incline_Bench_Press_-_Medium_Grip', d([], ['front'])],
    ['Pushups', d([], ['front'])],
    ['Dips_-_Chest_Version', d([], ['front'])],
    ['Incline_Dumbbell_Flyes', d([], ['front'])],
    ['Bent_Over_Barbell_Row', d([], ['rear'])],
    ['Wide-Grip_Lat_Pulldown', d([], ['rear'])], // "pull" pattern
    ['Barbell_Curl', undefined],
    ['Cuban_Press', d(['rear'], ['side'])], // override
    ['Shoulder_Raise', undefined], // override null: a shrug
    ['External_Rotation', undefined],
  ];
  for (const [id, expected] of cases) {
    it(`${id}`, () => {
      const r = byId(id);
      expect(classifyDelts(r)).toEqual(expected);
    });
  }
});

describe('classifyDelts: reguły', () => {
  it('wzorzec tylnego barku działa także bez "shoulders" w mięśniach', () => {
    expect(classifyDelts(synth('Rear Lateral Raise', ['middle back']))).toEqual(d(['rear']));
  });

  it('bez "shoulders" i bez wzorca tylnego: nieznane', () => {
    expect(classifyDelts(synth('Lateral Raise', ['biceps']))).toBeUndefined();
    expect(classifyDelts(synth('Bench Press', ['chest'], ['triceps']))).toBeUndefined();
  });

  it('barki tylko jako drugorzędne: głowy trafiają do secondary', () => {
    expect(classifyDelts(synth('Cable Lateral Raise', ['biceps'], ['shoulders']))).toEqual(d([], ['side']));
    expect(classifyDelts(synth('Seated Cable Row', ['middle back'], ['shoulders']))).toEqual(d([], ['rear']));
    expect(classifyDelts(synth('Upright Row', ['traps'], ['shoulders']))).toEqual(d([], ['side', 'front']));
  });

  it('wyciskanie na ławce, nawet gdy barki są główne, to tylko przód jako drugorzędny', () => {
    expect(classifyDelts(synth('Incline Bench Press', ['shoulders']))).toEqual(d([], ['front']));
  });

  it('"reverse fly" bije "fly" (tył, nie przód)', () => {
    expect(classifyDelts(synth('Cable Reverse Fly', ['shoulders']))).toEqual(d(['rear']));
    expect(classifyDelts(synth('Dumbbell Fly', ['chest'], ['shoulders']))).toEqual(d([], ['front']));
  });

  it('wiersz bez wzorca (nawet z barkami głównymi) zostaje nieznany', () => {
    expect(classifyDelts(synth('Moje boczne unoszenie', ['shoulders']))).toBeUndefined();
    expect(classifyDelts(synth('Shoulder Shrug Thing', ['shoulders']))).toBeUndefined();
  });
});

describe('pomocnicze', () => {
  it('etykiety', () => {
    expect(DELT_LABEL).toEqual({ front: 'przód', side: 'bok', rear: 'tył' });
    expect(deltChipLabel('front')).toBe('Barki — przód');
    expect(deltChipLabel('rear')).toBe('Barki — tył');
  });

  it('deltHeadsOf: role', () => {
    const ex = { delts: d(['side'], ['front', 'side']) };
    expect(deltHeadsOf(ex)).toEqual(['side', 'front']);
    expect(deltHeadsOf(ex, 'primary')).toEqual(['side']);
    expect(deltHeadsOf(ex, 'secondary')).toEqual(['front', 'side']);
    expect(deltHeadsOf({}, 'any')).toEqual([]);
  });
});
