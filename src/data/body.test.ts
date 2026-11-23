import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { db } from './db';
import {
  saveBodyEntry, deleteBodyEntry, listBodyEntries, entryValues, metricSeries,
  metricSummary, overview, formatChange, BODY_METRICS,
} from './body';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

describe('body data', () => {
  it('keeps only given fields', async () => {
    const id = await saveBodyEntry({
      date: '2026-01-01',
      values: { weight: 80, waist: 85, bodyFat: NaN, chest: 0, neck: -1, hips: undefined },
    });
    const e = (await db.body.get(id))!;
    expect(e.weightKg).toBe(80);
    expect(e.bodyFatPct).toBeUndefined();
    expect(e.measurements).toEqual({ waist: 85 });
    expect(entryValues(e)).toEqual({ weight: 80, waist: 85 });
  });

  it('rejects empty entries', async () => {
    await expect(saveBodyEntry({ date: '2026-01-01', values: { weight: 0 } }))
      .rejects.toThrow('Wpisz przynajmniej jedną wartość');
    expect(await db.body.count()).toBe(0);
  });

  it('edit replaces values', async () => {
    const id = await saveBodyEntry({ date: '2026-01-01', values: { weight: 80, waist: 85 } });
    await saveBodyEntry({ id, date: '2026-01-02', values: { bodyFat: 15 } });
    const list = await listBodyEntries();
    expect(list).toHaveLength(1);
    expect(list[0].date).toBe('2026-01-02');
    expect(entryValues(list[0])).toEqual({ bodyFat: 15 });
  });

  it('deletes', async () => {
    const id = await saveBodyEntry({ date: '2026-01-01', values: { weight: 80 } });
    await deleteBodyEntry(id);
    expect(await listBodyEntries()).toEqual([]);
  });

  it('orders series by date, ties by input order', () => {
    const mk = (id: string, date: string, w: number) => ({ id, date, weightKg: w, measurements: {} });
    const s = metricSeries(
      [mk('a', '2026-01-01', 80), mk('b', '2026-01-05', 81), mk('c', '2026-01-05', 82)],
      'weight',
    );
    expect(s.map(p => p.value)).toEqual([80, 81, 82]);
    expect(s[0].at).toBe(at(2026, 1, 1));
  });

  it('summaries', async () => {
    await saveBodyEntry({ date: '2026-01-01', values: { weight: 80 } });
    await saveBodyEntry({ date: '2026-02-01', values: { weight: 82 } });
    await saveBodyEntry({ date: '2026-02-10', values: { weight: 83.5 } });
    const entries = await listBodyEntries();
    const s = metricSummary(entries, 'weight', { start: at(2026, 2, 1), end: at(2026, 2, 10) });
    expect(s.points).toHaveLength(1);
    expect(s.latest).toBe(82);
    expect(s.changeInPeriod).toBeUndefined();
    expect(s.changeFromStart).toBe(2);
    const s2 = metricSummary(entries, 'weight', { start: at(2026, 1, 1), end: at(2026, 3, 1) });
    expect(s2.changeInPeriod).toBe(3.5);
    expect(s2.changeFromStart).toBe(3.5);
    const s3 = metricSummary(entries, 'weight', { start: at(2026, 1, 1), end: at(2026, 1, 2) });
    expect(s3.latest).toBe(80);
    expect(s3.changeFromStart).toBeUndefined();
    const s4 = metricSummary(entries, 'weight', { start: at(2027, 1, 1), end: at(2027, 2, 1) });
    expect(s4.points).toEqual([]);
    expect(s4.latest).toBeUndefined();
  });

  it('overview follows BODY_METRICS order with trends', async () => {
    await saveBodyEntry({ date: '2026-01-01', values: { waist: 85, weight: 80, chest: 100 } });
    await saveBodyEntry({ date: '2026-01-02', values: { waist: 84, weight: 80 } });
    const o = overview(await listBodyEntries());
    expect(o.map(x => x.metric)).toEqual(['weight', 'chest', 'waist']);
    expect(BODY_METRICS[0].key).toBe('weight');
    expect(o[0].trend).toBe('flat');
    expect(o[1].trend).toBeNull();
    expect(o[1].changeFromStart).toBeUndefined();
    expect(o[2].trend).toBe('down');
    expect(o[2].changeFromStart).toBe(-1);
  });

  it('formatChange', () => {
    expect(formatChange(2.5, 'cm')).toBe('+2,5 cm');
    expect(formatChange(-1, 'kg')).toBe('−1 kg');
    expect(formatChange(0, 'cm')).toBe('0 cm');
    expect(formatChange(1.5, '%')).toBe('+1,5 %');
    expect(formatChange(0.04, 'kg')).toBe('0 kg');
    expect(formatChange(-0.26, 'kg')).toBe('−0,3 kg');
  });

  it('upgrade from v1 keeps workouts', async () => {
    await db.delete();
    const v1 = new Dexie('gym-app');
    v1.version(1).stores({
      exercises: 'id, name',
      notes: 'exerciseId',
      plans: 'id',
      workouts: 'id, startedAt, importKey',
      sets: 'id, workoutId, exerciseId, [exerciseId+workoutId]',
      settings: 'key',
      aliases: 'sourceName',
    });
    await v1.open();
    await v1.table('workouts').add({ id: 'w1', name: 'Old', startedAt: 1, source: 'app' });
    v1.close();
    await db.open();
    expect((await db.workouts.get('w1'))?.name).toBe('Old');
    const id = await saveBodyEntry({ date: '2026-01-01', values: { weight: 80 } });
    expect((await db.body.get(id))?.weightKg).toBe(80);
  });
});
