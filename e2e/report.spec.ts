import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const FIXTURE = fileURLToPath(new URL('../tests/fixtures/sample-export.csv', import.meta.url));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Desktop-like browser: no Web Share with files, so the report downloads.
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
});

test('raport dla trenera: od początku → plik xlsx', async ({ page }) => {
  await page.goto('/#/ustawienia/import');
  await page.getByLabel('Plik CSV').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: /^Importuj/ }).click();
  await expect(page.getByRole('status')).toContainText('Zaimportowano 3 treningi (12 serii)');

  await page.goto('/#/statystyki');
  await page.getByRole('link', { name: 'Raport dla trenera' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Raport dla trenera' })).toBeVisible();
  await page.getByRole('tab', { name: 'Od początku' }).click();
  await expect(page.getByRole('group', { name: 'Zakres raportu' })).toContainText('3 treningi');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Utwórz raport' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^raport-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.xlsx$/);
  await expect(page.getByRole('status')).toContainText('Raport pobrany');

  const path = test.info().outputPath('raport.xlsx');
  await download.saveAs(path);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  expect(wb.worksheets.map((w) => w.name)).toEqual([
    'Podsumowanie', 'Treningi', 'Serie', 'Progres ćwiczeń', 'Pomiary ciała',
  ]);
  const serie = wb.getWorksheet('Serie')!;
  expect(serie.getRow(1).getCell(1).value).toBe('Data');
  expect(serie.actualRowCount).toBe(13); // header + 12 sets
  expect(wb.getWorksheet('Treningi')!.actualRowCount).toBe(4);
});

test('raport: własny zakres dat i błędny zakres', async ({ page }) => {
  await page.goto('/#/statystyki/raport');
  await page.getByRole('tab', { name: 'Własny' }).click();
  await page.getByLabel('Od', { exact: true }).fill('2026-11-10');
  await page.getByLabel('Do', { exact: true }).fill('2026-11-01');
  await expect(page.getByRole('alert')).toContainText('Data początkowa jest po końcowej');
  await expect(page.getByRole('button', { name: 'Utwórz raport' })).toBeDisabled();

  await page.getByLabel('Do', { exact: true }).fill('2026-11-30');
  await expect(page.getByRole('group', { name: 'Zakres raportu' })).toContainText('10.11.2026 – 30.11.2026');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Utwórz raport' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('raport-2026-11-10_2026-11-30.xlsx');
});
