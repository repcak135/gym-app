import ExcelJS from 'exceljs';
import { BODY_METRICS } from './body';
import type { ReportData } from './report';

// Workbook for the coach report. Loaded with dynamic import() so ExcelJS stays out of the main bundle.

export const SHEETS = ['Podsumowanie', 'Treningi', 'Serie', 'Progres ćwiczeń', 'Pomiary ciała'] as const;

export const HEADERS: Record<'Treningi' | 'Serie' | 'Progres ćwiczeń', string[]> = {
  Treningi: ['Data', 'Dzień', 'Czas (min)', 'Ćwiczenia', 'Serie robocze', 'Objętość (kg)'],
  Serie: ['Data', 'Trening', 'Ćwiczenie', 'Seria', 'Ciężar (kg)', 'Powtórzenia', 'RIR', 'Rozgrzewka'],
  'Progres ćwiczeń': [
    'Ćwiczenie',
    'Serie robocze',
    'Najlepszy ciężar – początek (kg)',
    'Najlepszy ciężar – koniec (kg)',
    'Zmiana (kg)',
    'Szac. 1RM – początek (kg)',
    'Szac. 1RM – koniec (kg)',
    'Zmiana 1RM (kg)',
  ],
};

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const DATE_FMT = 'dd.mm.yyyy';
const KG_FMT = '0.0';
const VOL_FMT = '#,##0';
const ACCENT = 'FF2B6CB0';

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Excel date from a local calendar day (ExcelJS writes Date as UTC). */
function excelDate(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m, day));
}
function dateFromMs(t: number): Date {
  const d = new Date(t);
  return excelDate(d.getFullYear(), d.getMonth(), d.getDate());
}
function dateFromYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return excelDate(y, m - 1, d);
}
function dmy(s: string): string {
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}

function styleHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
}

function addTable(
  wb: ExcelJS.Workbook,
  name: string,
  headers: string[],
  widths: number[],
  formats: (string | undefined)[],
  rows: (string | number | boolean | Date | null | undefined)[][],
): void {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = headers.map((h, i) => ({ header: h, width: widths[i] }));
  styleHeader(ws.getRow(1));
  for (const r of rows) {
    const row = ws.addRow(r.map((v) => v ?? null));
    formats.forEach((f, i) => {
      if (f) row.getCell(i + 1).numFmt = f;
    });
  }
}

function durationText(sec: number): string {
  const min = Math.round(sec / 60);
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export async function buildWorkbook(data: ReportData): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gym app';
  wb.created = new Date();

  // Podsumowanie
  const ws = wb.addWorksheet('Podsumowanie');
  ws.columns = [{ width: 34 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
  const s = data.summary;
  const pair = (label: string, value: string | number, fmt?: string) => {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { horizontal: 'right' };
    if (fmt) row.getCell(2).numFmt = fmt;
  };
  pair('Okres', `${dmy(data.from)} – ${dmy(data.to)}`);
  pair('Treningi', s.workouts);
  pair('Łączny czas', durationText(s.totalSec));
  pair('Treningi z zapisanym czasem', s.timedWorkouts);
  pair('Serie robocze', s.workingSets);
  pair('Objętość (kg)', s.volume, VOL_FMT);
  pair('Nowe rekordy', s.records.length);

  ws.addRow([]);
  styleHeader(ws.addRow(['Data', 'Ćwiczenie', 'Rekord', 'Wartość (kg)', 'Poprzednio (kg)']));
  for (const r of s.records) {
    const row = ws.addRow([dateFromMs(r.date), r.exercise, r.kind, r.value, r.previous]);
    row.getCell(1).numFmt = DATE_FMT;
    row.getCell(1).alignment = { horizontal: 'left' };
    row.getCell(4).numFmt = KG_FMT;
    row.getCell(5).numFmt = KG_FMT;
  }

  ws.addRow([]);
  styleHeader(ws.addRow(['Wymiar', 'Początek', 'Koniec', 'Zmiana']));
  for (const b of s.body) {
    const row = ws.addRow([`${b.label} (${b.unit})`, b.start ?? null, b.end ?? null, b.change ?? null]);
    for (let c = 2; c <= 4; c++) row.getCell(c).numFmt = KG_FMT;
  }
  ws.getColumn(2).width = 22;

  addTable(
    wb,
    'Treningi',
    HEADERS.Treningi,
    [14, 24, 12, 60, 14, 16],
    [DATE_FMT, undefined, undefined, undefined, undefined, VOL_FMT],
    data.workouts.map((w) => [dateFromMs(w.date), w.name, w.durationMin, w.exercises, w.workingSets, w.volume]),
  );

  addTable(
    wb,
    'Serie',
    HEADERS.Serie,
    [14, 24, 32, 8, 12, 13, 8, 12],
    [DATE_FMT, undefined, undefined, undefined, KG_FMT],
    data.sets.map((x) => [
      dateFromMs(x.date), x.workout, x.exercise, x.set, x.weight, x.reps, x.rir, x.warmup ? 'Tak' : 'Nie',
    ]),
  );

  addTable(
    wb,
    'Progres ćwiczeń',
    HEADERS['Progres ćwiczeń'],
    [32, 14, 22, 22, 13, 20, 20, 16],
    [undefined, undefined, KG_FMT, KG_FMT, KG_FMT, KG_FMT, KG_FMT, KG_FMT],
    data.progress.map((p) => [
      p.exercise, p.workingSets, p.startWeight, p.endWeight, round1(p.endWeight - p.startWeight),
      p.startE1rm, p.endE1rm, round1(p.endE1rm - p.startE1rm),
    ]),
  );

  addTable(
    wb,
    'Pomiary ciała',
    ['Data', ...BODY_METRICS.map((m) => `${m.label} (${m.unit})`)],
    [14, ...BODY_METRICS.map(() => 16)],
    [DATE_FMT, ...BODY_METRICS.map(() => KG_FMT)],
    data.body.map((b) => [dateFromYmd(b.date), ...BODY_METRICS.map((m) => b.values[m.key])]),
  );

  return wb;
}

export async function reportBlob(data: ReportData): Promise<Blob> {
  const wb = await buildWorkbook(data);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: XLSX_MIME });
}
