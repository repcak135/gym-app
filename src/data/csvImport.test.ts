import sample from '../../tests/fixtures/sample-export.csv?raw';
import { describe, expect, it } from 'vitest';
import { groupWorkouts, ImportFormatError, matchExercises, matchScore, parseCsv, splitCsv } from './csvImport';
import rawDb from './exercise-db.json';

const exercises = (rawDb as { id: string; name: string }[]).map((e) => ({ id: e.id, name: e.name }));
const idOf = (name: string) => exercises.find((e) => e.name === name)!.id;

describe('parseCsv', () => {
  it('reads the export with BOM, CRLF, a blank line, quotes and an empty reps cell', () => {
    const { rows, skipped } = parseCsv(sample);
    expect(rows).toHaveLength(12);
    expect(skipped).toBe(1);
    expect(rows[0]).toMatchObject({
      date: '2026-03-02 18:05:00',
      workoutName: 'Push A',
      exercise: 'Dumbbell Bench Press',
      set: 1,
      weight: 20,
      reps: 10,
    });
    expect(rows[0].startedAt).toBe(new Date(2026, 2, 2, 18, 5, 0).getTime());
    expect(rows.find((r) => r.exercise.startsWith('Curl'))!.exercise).toBe('Curl, Hammer Style');
    expect(rows.filter((r) => r.exercise === 'Wiosło Krzywe')).toHaveLength(3); // trailing space trimmed
  });

  it('converts lbs to kg', () => {
    const squat = parseCsv(sample).rows.filter((r) => r.exercise === 'Barbell Squat');
    expect(squat[0].weight).toBe(61.23);
    expect(squat[1].weight).toBe(60);
  });

  it('rejects a file without the expected columns', () => {
    expect(() => parseCsv('a,b,c\n1,2,3\n')).toThrow(ImportFormatError);
  });

  it('handles escaped quotes', () => {
    expect(splitCsv('a,"b ""x"", c"\n')).toEqual([['a', 'b "x", c']]);
  });
});

describe('groupWorkouts', () => {
  it('one workout per Date + name, oldest first, stable keys', () => {
    const ws = groupWorkouts(parseCsv(sample).rows);
    expect(ws.map((w) => w.name)).toEqual(['Push A', 'Pull A', 'Legs A']);
    expect(ws[0].importKey).toBe('csv|2026-03-02 18:05:00|Push A');
    expect(ws.map((w) => w.rows.length)).toEqual([4, 5, 3]);
  });
});

describe('matchExercises', () => {
  it('alias first, then case-insensitive exact, then fuzzy, else none', () => {
    const custom = { id: 'custom-1', name: 'Wiosło Krzywe' };
    const list = [...exercises, custom];
    const m = matchExercises(
      ['Wide Grip Lat Pull Down', 'dumbbell bench press', 'Rotatory', 'Ferrari', 'Wiosło Krzywe'],
      list,
      [{ sourceName: 'Rotatory', exerciseId: idOf('Leg Extensions') }],
    );
    expect(m[0]).toMatchObject({ how: 'fuzzy', exerciseId: idOf('Wide-Grip Lat Pulldown'), score: 1 });
    expect(m[1]).toMatchObject({ how: 'exact', exerciseId: idOf('Dumbbell Bench Press') });
    expect(m[2]).toMatchObject({ how: 'alias', exerciseId: idOf('Leg Extensions') });
    expect(m[3]).toMatchObject({ how: 'none', exerciseId: null });
    expect(m[4]).toMatchObject({ how: 'exact', exerciseId: 'custom-1' });
  });

  it('finds the obvious database names for the owner-style names', () => {
    const cases: [string, string][] = [
      ['Pull Ups', 'Pullups'],
      ['Chin Ups', 'Chin-Up'],
      ['Barbell Bench Press', 'Barbell Bench Press - Medium Grip'],
      ['Dumbbell Shrugs', 'Dumbbell Shrug'],
      ['V Bar Pulldown', 'V-Bar Pulldown'],
      ['Preacher Curl Machine', 'Machine Preacher Curls'],
      ['Hack Squat Machine', 'Hack Squat'],
    ];
    const m = matchExercises(cases.map((c) => c[0]), exercises, []);
    cases.forEach(([, expected], i) => expect(m[i].exerciseId, cases[i][0]).toBe(idOf(expected)));
  });

  it('ignores aliases pointing at deleted exercises', () => {
    const m = matchExercises(['Ferrari'], exercises, [{ sourceName: 'Ferrari', exerciseId: 'gone' }]);
    expect(m[0].how).toBe('none');
  });

  it('scores are symmetric 0..1', () => {
    expect(matchScore('Leg Press', 'Leg Press')).toBe(1);
    expect(matchScore('Leg Press', 'Ferrari')).toBe(0);
  });
});

describe('matching with other names', () => {
  const list = [
    { id: 'fly', name: 'Butterfly', aka: ['Butterfly Machine (Pec Deck)'] },
    { id: 'lat', name: 'One Arm Lat Pulldown', similar: ['Lat pulldown klęcząc jedną ręką'] },
    { id: 'side', name: 'Side Lateral Raise', maybe: ['Tokarski lateral raises'] },
    { id: 'mach', name: 'Machine Lateral Raise' },
  ];
  it('aka = exact; similar = 0.8 (pre-selected); maybe = 0.7 even when a weak fuzzy match scores higher', () => {
    const m = matchExercises(['butterfly machine (pec deck)', 'Lat pulldown klęcząc jedną ręką ', 'Tokarski lateral raises'], list, []);
    expect(m[0]).toMatchObject({ how: 'exact', exerciseId: 'fly' });
    expect(m[1]).toMatchObject({ how: 'fuzzy', exerciseId: 'lat', score: 0.8 });
    expect(m[2]).toMatchObject({ how: 'fuzzy', exerciseId: 'side', score: 0.7 });
  });
});
