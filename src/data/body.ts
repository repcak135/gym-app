import { db } from './db';
import type { BodyEntry, BodyMetric, MeasureKey } from './types';

export const BODY_METRICS: readonly { key: BodyMetric; label: string; unit: 'kg' | 'cm' | '%' }[] = [
  { key: 'weight', label: 'Waga', unit: 'kg' },
  { key: 'bodyFat', label: 'Tkanka tłuszczowa', unit: '%' },
  { key: 'neck', label: 'Szyja', unit: 'cm' },
  { key: 'shoulders', label: 'Barki', unit: 'cm' },
  { key: 'chest', label: 'Klatka', unit: 'cm' },
  { key: 'waist', label: 'Talia', unit: 'cm' },
  { key: 'hips', label: 'Biodra', unit: 'cm' },
  { key: 'bicepsL', label: 'Biceps L', unit: 'cm' },
  { key: 'bicepsR', label: 'Biceps P', unit: 'cm' },
  { key: 'forearmL', label: 'Przedramię L', unit: 'cm' },
  { key: 'forearmR', label: 'Przedramię P', unit: 'cm' },
  { key: 'thighL', label: 'Udo L', unit: 'cm' },
  { key: 'thighR', label: 'Udo P', unit: 'cm' },
  { key: 'calfL', label: 'Łydka L', unit: 'cm' },
  { key: 'calfR', label: 'Łydka P', unit: 'cm' },
];

type Values = Partial<Record<BodyMetric, number>>;
export interface SeriesPoint { date: string; at: number; value: number }

const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

export async function saveBodyEntry(input: { id?: string; date: string; values: Values }): Promise<string> {
  const entry: BodyEntry = { id: input.id ?? crypto.randomUUID(), date: input.date, measurements: {} };
  let count = 0;
  for (const { key } of BODY_METRICS) {
    const v = input.values[key];
    if (!valid(v)) continue;
    count++;
    if (key === 'weight') entry.weightKg = v;
    else if (key === 'bodyFat') entry.bodyFatPct = v;
    else entry.measurements[key as MeasureKey] = v;
  }
  if (count === 0) throw new Error('Wpisz przynajmniej jedną wartość');
  await db.body.put(entry);
  return entry.id;
}

export async function deleteBodyEntry(id: string): Promise<void> {
  await db.body.delete(id);
}

export async function listBodyEntries(): Promise<BodyEntry[]> {
  const all = await db.body.toArray();
  return all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function entryValues(e: BodyEntry): Values {
  const out: Values = {};
  if (e.weightKg !== undefined) out.weight = e.weightKg;
  if (e.bodyFatPct !== undefined) out.bodyFat = e.bodyFatPct;
  for (const [k, v] of Object.entries(e.measurements ?? {})) {
    if (v !== undefined) out[k as MeasureKey] = v;
  }
  return out;
}

function dateToAt(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function metricSeries(entries: BodyEntry[], metric: BodyMetric): SeriesPoint[] {
  const pts: SeriesPoint[] = [];
  for (const e of entries) {
    const v = entryValues(e)[metric];
    if (v !== undefined) pts.push({ date: e.date, at: dateToAt(e.date), value: v });
  }
  // stable sort: ties keep input order
  return pts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function metricSummary(
  entries: BodyEntry[],
  metric: BodyMetric,
  range: { start: number; end: number },
): { points: SeriesPoint[]; latest?: number; changeInPeriod?: number; changeFromStart?: number } {
  const all = metricSeries(entries, metric);
  const points = all.filter(p => p.at >= range.start && p.at < range.end);
  if (points.length === 0) return { points };
  const last = points[points.length - 1];
  const res: { points: SeriesPoint[]; latest?: number; changeInPeriod?: number; changeFromStart?: number } = {
    points,
    latest: last.value,
  };
  if (points.length >= 2) res.changeInPeriod = last.value - points[0].value;
  if (last !== all[0]) res.changeFromStart = last.value - all[0].value;
  return res;
}

export function overview(entries: BodyEntry[]): {
  metric: BodyMetric; latest: number; date: string; trend: 'up' | 'down' | 'flat' | null; changeFromStart?: number;
}[] {
  const out: ReturnType<typeof overview> = [];
  for (const { key } of BODY_METRICS) {
    const s = metricSeries(entries, key);
    if (s.length === 0) continue;
    const last = s[s.length - 1];
    let trend: 'up' | 'down' | 'flat' | null = null;
    if (s.length >= 2) {
      const prev = s[s.length - 2].value;
      trend = last.value > prev ? 'up' : last.value < prev ? 'down' : 'flat';
    }
    const item: ReturnType<typeof overview>[number] = { metric: key, latest: last.value, date: last.date, trend };
    if (s.length >= 2) item.changeFromStart = last.value - s[0].value;
    out.push(item);
  }
  return out;
}

export function formatChange(v: number, unit: 'kg' | 'cm' | '%'): string {
  const r = Math.round(v * 10) / 10;
  const abs = Math.abs(r).toFixed(1).replace(/\.0$/, '').replace('.', ',');
  const sign = r > 0 ? '+' : r < 0 ? '−' : '';
  return `${sign}${abs} ${unit}`;
}
