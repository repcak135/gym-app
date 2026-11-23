import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { BODY_METRICS } from './body';
import type { ReportData } from './report';
import { buildWorkbook, HEADERS, reportBlob, SHEETS } from './reportXlsx';

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min).getTime();

const DATA: ReportData = {
  from: '2026-11-01',
  to: '2026-11-30',
  summary: {
    workouts: 2,
    timedWorkouts: 1,
    totalSec: 45_000,
    workingSets: 4,
    volume: 1450,
    records: [{ date: d(2026, 11, 10, 18), exercise: 'Wyciskanie', kind: 'Ciężar', value: 65, previous: 60 }],
    body: [{ label: 'Waga', unit: 'kg', start: 80, end: 78.5, change: -1.5 }],
  },
  workouts: [
    { date: d(2026, 11, 3, 0, 5), name: 'Push', durationMin: 60, exercises: 'Wyciskanie, Przysiad', workingSets: 3, volume: 1125 },
    { date: d(2026, 11, 10, 23, 55), name: 'Import', exercises: 'Wyciskanie', workingSets: 1, volume: 325 },
  ],
  sets: [
    { date: d(2026, 11, 3, 0, 5), workout: 'Push', exercise: 'Wyciskanie', set: 1, weight: 40, reps: 10, warmup: true },
    { date: d(2026, 11, 3, 0, 5), workout: 'Push', exercise: 'Wyciskanie', set: 2, weight: 62.5, reps: 5, rir: 2, warmup: false },
  ],
  progress: [
    { exercise: 'Wyciskanie', workingSets: 3, startWeight: 62.5, endWeight: 65, startE1rm: 72.9, endE1rm: 75.8 },
  ],
  body: [{ date: '2026-11-02', values: { weight: 80 } }],
};

const EMPTY: ReportData = {
  from: '2026-11-01',
  to: '2026-11-30',
  summary: { workouts: 0, timedWorkouts: 0, totalSec: 0, workingSets: 0, volume: 0, records: [], body: [] },
  workouts: [],
  sets: [],
  progress: [],
  body: [],
};

const headerValues = (ws: ExcelJS.Worksheet): string[] =>
  (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v));

describe('buildWorkbook', () => {
  it('has the sheets in order', async () => {
    const wb = await buildWorkbook(DATA);
    expect(wb.worksheets.map((w) => w.name)).toEqual([...SHEETS]);
  });

  it('writes the header rows', async () => {
    const wb = await buildWorkbook(DATA);
    expect(headerValues(wb.getWorksheet('Treningi')!)).toEqual(HEADERS.Treningi);
    expect(headerValues(wb.getWorksheet('Serie')!)).toEqual(HEADERS.Serie);
    expect(headerValues(wb.getWorksheet('Progres ćwiczeń')!)).toEqual(HEADERS['Progres ćwiczeń']);
    expect(headerValues(wb.getWorksheet('Pomiary ciała')!)).toEqual([
      'Data',
      ...BODY_METRICS.map((m) => `${m.label} (${m.unit})`),
    ]);
  });

  it('header row is bold and frozen', async () => {
    const wb = await buildWorkbook(DATA);
    for (const name of ['Treningi', 'Serie', 'Progres ćwiczeń', 'Pomiary ciała']) {
      const ws = wb.getWorksheet(name)!;
      expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
      expect(ws.getRow(1).getCell(1).fill).toMatchObject({ fgColor: { argb: 'FF2B6CB0' } });
      expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    }
  });

  it('writes dates as the same local calendar day with dd.mm.yyyy', async () => {
    const wb = await buildWorkbook(DATA);
    const ws = wb.getWorksheet('Treningi')!;
    for (const [rowNo, day] of [[2, 3], [3, 10]] as const) {
      const cell = ws.getRow(rowNo).getCell(1);
      expect(cell.numFmt).toBe('dd.mm.yyyy');
      const v = cell.value as Date;
      expect([v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()]).toEqual([2026, 11, day]);
    }
    const body = wb.getWorksheet('Pomiary ciała')!.getRow(2).getCell(1);
    expect(body.numFmt).toBe('dd.mm.yyyy');
    expect((body.value as Date).toISOString().slice(0, 10)).toBe('2026-11-02');
  });

  it('formats numbers and flags', async () => {
    const wb = await buildWorkbook(DATA);
    const t = wb.getWorksheet('Treningi')!.getRow(2);
    expect(t.getCell(6).numFmt).toBe('#,##0');
    expect(wb.getWorksheet('Treningi')!.getRow(3).getCell(3).value).toBeNull();
    const sets = wb.getWorksheet('Serie')!;
    expect(sets.getRow(2).getCell(8).value).toBe('Tak');
    expect(sets.getRow(3).getCell(8).value).toBe('Nie');
    expect(sets.getRow(2).getCell(7).value).toBeNull();
    expect(sets.getRow(3).getCell(7).value).toBe(2);
    expect(sets.getRow(3).getCell(5).numFmt).toBe('0.0');
    const prog = wb.getWorksheet('Progres ćwiczeń')!.getRow(2);
    expect(prog.getCell(5).value).toBe(2.5);
    expect(prog.getCell(8).value).toBe(2.9);
  });

  it('summary sheet has the period, totals, records and body tables', async () => {
    const wb = await buildWorkbook(DATA);
    const ws = wb.getWorksheet('Podsumowanie')!;
    const col = (n: number) => ws.getColumn(n).values as unknown[];
    const a = col(1);
    expect(a.slice(1, 8)).toEqual([
      'Okres', 'Treningi', 'Łączny czas', 'Treningi z zapisanym czasem', 'Serie robocze', 'Objętość (kg)', 'Nowe rekordy',
    ]);
    const b = col(2);
    expect(b[1]).toBe('01.11.2026 – 30.11.2026');
    expect(b[3]).toBe('12 h 30 min');
    expect(b[6]).toBe(1450);
    expect(b[7]).toBe(1);
    expect(ws.getRow(9).getCell(1).value).toBe('Data');
    expect(ws.getRow(9).getCell(1).font?.bold).toBe(true);
    expect(ws.getRow(10).getCell(2).value).toBe('Wyciskanie');
    expect(ws.getRow(12).getCell(1).value).toBe('Wymiar');
    expect(ws.getRow(13).getCell(1).value).toBe('Waga (kg)');
    expect(ws.getColumn(1).width).toBe(34);
  });

  it('empty data still has all sheets with headers', async () => {
    const wb = await buildWorkbook(EMPTY);
    expect(wb.worksheets.map((w) => w.name)).toEqual([...SHEETS]);
    expect(headerValues(wb.getWorksheet('Treningi')!)).toEqual(HEADERS.Treningi);
    expect(headerValues(wb.getWorksheet('Serie')!)).toEqual(HEADERS.Serie);
    expect(headerValues(wb.getWorksheet('Progres ćwiczeń')!)).toEqual(HEADERS['Progres ćwiczeń']);
    expect(wb.getWorksheet('Pomiary ciała')!.getRow(1).getCell(1).value).toBe('Data');
    expect(wb.getWorksheet('Treningi')!.rowCount).toBe(1);
    expect(wb.getWorksheet('Podsumowanie')!.getRow(1).getCell(2).value).toBe('01.11.2026 – 30.11.2026');
  });
});

describe('reportBlob', () => {
  it('produces an xlsx that loads back', async () => {
    const blob = await reportBlob(DATA);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(blob.size).toBeGreaterThan(0);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual([...SHEETS]);
    expect(wb.getWorksheet('Serie')!.getRow(3).getCell(3).value).toBe('Wyciskanie');
  });
});
