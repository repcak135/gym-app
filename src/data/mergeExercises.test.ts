import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { getSettings, updateSettings } from './settings';
import { MERGED_EXERCISES, canonicalExerciseId, seedExercises } from './exercises';
import { createBackup, restoreBackup } from './backup';
import { commitImport, prepareImport } from './importHistory';
import { resolveExercises, type SharedPlan } from './planShare';
import { BENCH_IDS, countsForBench } from '../ranking/scores';
import { readBaseline, writeBaseline } from '../cloud/stats';
import review from '../../scripts/merge-review-2.json';
import type { Exercise, WorkoutSet } from './types';

// Second duplicate review (catalogue 9): user data on a removed id must land on the kept exercise,
// whether it is already on the phone (upgrade), comes from an old backup, an old share link or the import.

const REMOVED = Object.entries(review.merge as Record<string, string[]>).flatMap(([keep, ids]) => ids.map((id) => [id, keep] as const));
const fake = (id: string, extra: Partial<Exercise> = {}): Exercise => ({
  id, name: `Stare ${id}`, primaryMuscles: ['chest'], secondaryMuscles: [], equipment: null, category: 'strength',
  instructions: [], images: [], custom: false, ...extra,
});
const set = (id: string, workoutId: string, exerciseId: string, exerciseOrder: number, setOrder: number, weight = 50): WorkoutSet => ({
  id, workoutId, exerciseId, exerciseOrder, setOrder, weight, reps: 8, warmup: false, completedAt: 1_700_000_000_000 + setOrder,
});
const item = (exerciseId: string) => ({ exerciseId, sets: 3, warmupSets: 0, repsMin: 8, repsMax: 12, restSec: 90 });

/** A phone still on catalogue 8: the removed duplicates exist as rows. */
async function phoneOnCatalogue8(ids: string[]) {
  await seedExercises();
  await db.exercises.bulkPut(ids.map((id) => fake(id)));
  await updateSettings({ exerciseDbVersion: 8 });
}

const summary = async () => {
  const sets = await db.sets.toArray();
  return {
    count: sets.length,
    volume: sets.reduce((n, s) => n + s.weight * s.reps, 0),
    perWorkout: Object.fromEntries((await db.workouts.toArray()).map((w) => [w.id, sets.filter((s) => s.workoutId === w.id).length])),
  };
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

describe('scalanie duplikatów (katalog 9)', () => {
  it('mapa: każde usunięte id prowadzi do istniejącego ćwiczenia, a zachowane nie jest scalone', async () => {
    await seedExercises();
    const ids = new Set((await db.exercises.toCollection().primaryKeys()).map(String));
    for (const [from, to] of Object.entries(MERGED_EXERCISES)) {
      expect(ids.has(to), `${from} → ${to}`).toBe(true);
      expect(ids.has(from), from).toBe(false);
    }
    for (const [from, to] of REMOVED) expect(canonicalExerciseId(from)).toBe(to);
    expect(REMOVED).toHaveLength(165);
  });

  it('ławka do rankingu: scalone id ławki prowadzą do ławki płaskiej ze sztangą', () => {
    for (const id of BENCH_IDS) expect(BENCH_IDS.has(canonicalExerciseId(id)), id).toBe(true);
    expect(canonicalExerciseId('og-0122')).toBe('Wide-Grip_Barbell_Bench_Press');
  });

  it('nowe nazwy rozdzielają różne ćwiczenia, a stare nazwy duplikatów są wyszukiwalne', async () => {
    await seedExercises();
    expect((await db.exercises.get('Crunches'))?.name).toBe('Spięcia brzucha');
    expect((await db.exercises.get('Parallel_Bar_Dip'))?.name).toBe('Pompki na poręczach (na triceps)');
    expect((await db.exercises.get('og-0251'))?.name).toBe('Pompki na poręczach (na klatkę)');
    const butterfly = (await db.exercises.get('Butterfly'))!;
    expect(butterfly.aka).toContain('Lever Pec Deck Fly');
    expect((await db.exercises.get('Running_Treadmill'))?.measure).toBe('timeDistance');
  });

  it('aktualizacja z katalogu 8: historia, plan, trening, notatka, ustawienia i statystyki przechodzą na zachowane', async () => {
    await phoneOnCatalogue8(['og-1030', 'og-0122', 'og-2197']);
    await db.exercises.update('og-1030', { weightStep: 2.5, userNames: ['Motylek'] });
    await db.workouts.bulkPut([
      { id: 'w1', name: 'A', startedAt: 1, endedAt: 2, source: 'app', exercises: [item('Butterfly'), item('og-1030')] },
      { id: 'w2', name: 'B', startedAt: 3, endedAt: 4, source: 'import' },
    ]);
    await db.sets.bulkPut([
      set('a', 'w1', 'Butterfly', 0, 0), set('b', 'w1', 'Butterfly', 0, 1),
      set('c', 'w1', 'og-1030', 1, 0), set('d', 'w1', 'og-1030', 1, 1),
      set('e', 'w2', 'og-0122', 0, 0, 100), set('f', 'w2', 'og-2197', 1, 0, 0),
    ]);
    await db.plans.put({ id: 'p1', name: 'P', startedAt: '2026-11-01', days: [
      { id: 'd1', name: 'A', items: [item('og-1030'), item('Butterfly')] },
      { id: 'd2', name: 'B', items: [item('og-0122')] },
    ] });
    await db.notes.put({ exerciseId: 'og-1030', text: 'siedzisko 3', updatedAt: 1 });
    await db.aliases.put({ sourceName: 'Pec deck', exerciseId: 'og-1030' });
    writeBaseline({ 'og-1030': 2, Butterfly: 2 });
    const before = await summary();

    await seedExercises();

    expect(await summary()).toEqual(before);
    expect((await getSettings()).exerciseDbVersion).toBe(9);
    expect(await db.exercises.get('og-1030')).toBeUndefined();
    const w1 = await db.sets.where('workoutId').equals('w1').sortBy('setOrder');
    expect(w1.map((s) => [s.exerciseId, s.exerciseOrder])).toEqual(Array(4).fill(['Butterfly', 0]));
    expect(new Set(w1.map((s) => s.setOrder)).size).toBe(4); // no two sets share a place
    expect((await db.workouts.get('w1'))?.exercises?.map((e) => e.exerciseId)).toEqual(['Butterfly']);
    const plan = (await db.plans.get('p1'))!;
    expect(plan.days[0].items.map((i) => i.exerciseId)).toEqual(['Butterfly']);
    expect(plan.days[1].items[0].exerciseId).toBe('Wide-Grip_Barbell_Bench_Press');
    expect((await db.sets.get('e'))?.exerciseId).toBe('Wide-Grip_Barbell_Bench_Press');
    expect(countsForBench((await db.sets.get('e'))!)).toBe(true); // still counts for the bench ranking
    expect((await db.sets.get('f'))?.exerciseId).toBe('Running_Treadmill');
    expect((await db.notes.get('Butterfly'))?.text).toBe('siedzisko 3');
    expect((await db.aliases.get('Pec deck'))?.exerciseId).toBe('Butterfly');
    const kept = (await db.exercises.get('Butterfly'))!;
    expect(kept.weightStep).toBe(2.5);
    expect(kept.userNames).toEqual(['Motylek']);
    expect(readBaseline()).toEqual({ Butterfly: 4 }); // already-sent stats are not sent again
  });

  it('stara kopia (plik lub chmura) ze starymi id: po przywróceniu wszystko wskazuje zachowane ćwiczenia', async () => {
    await phoneOnCatalogue8(['og-0405', 'Seated_Dumbbell_Press']);
    await db.exercises.update('og-0405', { weightStep: 1 });
    await db.workouts.put({ id: 'w1', name: 'Barki', startedAt: 1, endedAt: 2, source: 'app' });
    await db.sets.bulkPut([set('a', 'w1', 'og-0405', 0, 0, 20), set('b', 'w1', 'Seated_Dumbbell_Press', 1, 0, 22)]);
    await db.plans.put({ id: 'p1', name: 'P', startedAt: '2026-11-01', days: [{ id: 'd1', name: 'A', items: [item('Seated_Dumbbell_Press')] }] });
    const oldBackup = await createBackup();

    // A new phone on catalogue 9 restores it.
    await db.delete();
    await db.open();
    await seedExercises();
    await restoreBackup(oldBackup);

    const sets = await db.sets.toArray();
    expect(sets.map((s) => s.exerciseId)).toEqual(['Dumbbell_Shoulder_Press', 'Dumbbell_Shoulder_Press']);
    expect(sets.map((s) => s.weight).sort()).toEqual([20, 22]);
    expect((await db.plans.get('p1'))?.days[0].items[0].exerciseId).toBe('Dumbbell_Shoulder_Press');
    expect((await db.exercises.get('Dumbbell_Shoulder_Press'))?.weightStep).toBe(1);
    expect(await db.exercises.get('og-0405')).toBeUndefined();
  });

  it('import CSV: nazwy usuniętych duplikatów i zapamiętane dopasowania trafiają w zachowane ćwiczenie', async () => {
    await seedExercises();
    await db.aliases.put({ sourceName: 'Motyl', exerciseId: 'og-1030' });
    const csv = [
      'Date,Workout name,Exercise,Set,Weight,Reps,Distance,Duration,Measurement unit,Notes',
      '2026-03-02 18:05:00,Push,Lever Pec Deck Fly,1,40,10,,,kg,',
      '2026-03-02 18:05:00,Push,Motyl,1,40,10,,,kg,',
      '2026-03-02 18:05:00,Push,Barbell Wide Bench Press,1,80,5,,,kg,',
    ].join('\n');
    const p = await prepareImport(csv);
    const by = Object.fromEntries(p.names.map((n) => [n.sourceName, n.exerciseId]));
    expect(by).toEqual({ 'Lever Pec Deck Fly': 'Butterfly', Motyl: 'Butterfly', 'Barbell Wide Bench Press': 'Wide-Grip_Barbell_Bench_Press' });
  });

  it('stary link do planu z id duplikatu: ćwiczenie jest rozpoznane jako zachowane', async () => {
    await seedExercises();
    const ex = { id: 'og-1030', name: 'Rozpiętki na maszynie butterfly', custom: false, primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'machine' };
    const sp: SharedPlan = { name: 'P', days: [{ name: 'A', items: [{ ...item('x'), exercise: ex }] }], exercises: [ex] };
    expect((await resolveExercises(sp)).get('og-1030')).toEqual({ status: 'known', targetId: 'Butterfly' });
  });

  it('duża historia (skala importu Gym Day: 298 treningów, 7283 serie) przechodzi bez straty', async () => {
    const removed = REMOVED.slice(0, 40);
    await phoneOnCatalogue8(removed.map(([from]) => from));
    const ids = removed.flatMap(([from, to]) => [from, to]);
    const sets: WorkoutSet[] = [];
    for (let w = 0; w < 298; w++) {
      await db.workouts.put({ id: `w${w}`, name: 'T', startedAt: w, endedAt: w + 1, source: 'import' });
      for (let i = 0; sets.length < Math.round(((w + 1) * 7283) / 298); i++) {
        sets.push(set(`s${sets.length}`, `w${w}`, ids[(w * 7 + Math.floor(i / 4)) % ids.length], Math.floor(i / 4), i % 4, 10 + (i % 9) * 5));
      }
    }
    await db.sets.bulkPut(sets);
    const before = await summary();
    expect(before.count).toBe(7283);

    await seedExercises();

    expect(await summary()).toEqual(before);
    const left = await db.sets.filter((s) => MERGED_EXERCISES[s.exerciseId] !== undefined).count();
    expect(left).toBe(0);
  });

  // The owner's own export, never committed (git-excluded, only on the owner's PC): skipped elsewhere.
  const REAL = Object.values(import.meta.glob('../../.local-test/gym-day.csv', { query: '?raw', import: 'default', eager: true }))[0] as string | undefined;
  it.skipIf(!REAL)('prawdziwy eksport Gym Day właściciela: po scaleniu ta sama liczba treningów, serii i objętość', async () => {
    await seedExercises();
    const p = await prepareImport(REAL!);
    await commitImport(p, {});
    const imported = await summary();
    // Pretend the phone matched part of it to the duplicates that catalogue 9 removes.
    const toOld = new Map(REMOVED.map(([from, to]) => [to, from]));
    const used = (await db.sets.toArray()).filter((s) => toOld.has(s.exerciseId));
    await db.exercises.bulkPut([...new Set(used.map((s) => toOld.get(s.exerciseId)!))].map((id) => fake(id)));
    expect(used.length).toBeGreaterThan(100);
    await db.sets.bulkPut(used.filter((_, i) => i % 2 === 0).map((s) => ({ ...s, exerciseId: toOld.get(s.exerciseId)! })));
    await updateSettings({ exerciseDbVersion: 8 });

    await seedExercises();

    const after = await summary();
    expect(after.count).toBe(imported.count);
    expect(after.volume).toBe(imported.volume);
    expect(after.perWorkout).toEqual(imported.perWorkout);
    expect(await db.sets.filter((s) => MERGED_EXERCISES[s.exerciseId] !== undefined).count()).toBe(0);
  }, 60_000);
});
