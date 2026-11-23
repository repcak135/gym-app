import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../tests/fixtures/sample-export.csv', import.meta.url));

async function importSample(page: Page) {
  await page.goto('/#/ustawienia/import');
  await page.getByLabel('Plik CSV').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: /^Importuj/ }).click();
  await expect(page.getByRole('status')).toContainText('Zaimportowano 3 treningi (12 serii)');
}

test.describe('bez udostępniania plików (pobranie)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Desktop-like browser: no Web Share with files.
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    });
  });

  test('przypomnienie, kopia, zły plik, przywrócenie z podglądem', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.getByRole('region', { name: 'Przypomnienie o kopii' })).toHaveCount(0); // no data yet

    await importSample(page);
    await page.goto('/#/');
    const banner = page.getByRole('region', { name: 'Przypomnienie o kopii' });
    await expect(banner).toContainText('Nie masz jeszcze kopii');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      banner.getByRole('button', { name: 'Zrób kopię' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^gym-kopia-\d{4}-\d{2}-\d{2}\.json$/);
    const path = test.info().outputPath('kopia.json');
    await download.saveAs(path);
    await expect(banner).toContainText('Kopia pobrana');
    await page.reload();
    await expect(page.getByRole('region', { name: 'Przypomnienie o kopii' })).toHaveCount(0);

    // Ustawienia > Kopia zapasowa shows the last backup
    await page.getByRole('link', { name: 'Ustawienia' }).click();
    await page.getByRole('link', { name: 'Kopia zapasowa' }).click();
    await expect(page.getByText(/Ostatnia kopia:.*dzisiaj/)).toBeVisible();

    // a bad file changes nothing
    await page.getByLabel('Plik kopii').setInputFiles({ name: 'zly.json', mimeType: 'application/json', buffer: Buffer.from('nie json') });
    await expect(page.getByRole('alert')).toContainText('To nie jest plik kopii');

    // change data after the backup: one body measurement
    await page.goto('/#/statystyki');
    await page.getByRole('tab', { name: 'Ciało' }).click();
    await page.getByRole('button', { name: 'Dodaj pomiar' }).click();
    const sheet = page.getByRole('dialog', { name: 'Dodaj pomiar' });
    await sheet.getByLabel('Waga').fill('82,5');
    await sheet.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByRole('list', { name: 'Wymiary' })).toContainText('82,5 kg');

    // restore: preview, confirmation, data back to the backup
    await page.goto('/#/ustawienia/kopia');
    await page.getByLabel('Plik kopii').setInputFiles(path);
    const dialog = page.getByRole('dialog', { name: 'Kopia zapasowa' });
    await expect(dialog).toContainText(/Treningi\s*3/);
    await expect(dialog).toContainText(/Serie\s*12/);
    await expect(dialog).toContainText(/Pomiary ciała\s*0/);
    await dialog.getByRole('button', { name: 'Zastąp wszystko' }).click();
    await expect(dialog).toContainText('Na pewno zastąpić wszystkie dane?');
    await expect(dialog).toContainText('1 pomiar');
    await dialog.getByRole('button', { name: 'Tak, zastąp moje dane' }).click();
    await expect(page.getByRole('status')).toContainText('Dane przywrócone z kopii');

    await page.goto('/#/statystyki');
    await page.getByRole('tab', { name: 'Ciało' }).click();
    await expect(page.getByText(/Wpisz wagę albo obwody/)).toBeVisible();
  });

  test('„Później” ukrywa przypomnienie', async ({ page }) => {
    await importSample(page);
    await page.goto('/#/');
    const banner = page.getByRole('region', { name: 'Przypomnienie o kopii' });
    await banner.getByRole('button', { name: 'Później' }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Przypomnienie o kopii' })).toHaveCount(0);
  });
});

test('iPhone: kopia przez arkusz udostępniania', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { sharedFiles: { name: string; size: number }[] };
    w.sharedFiles = [];
    Object.defineProperty(navigator, 'canShare', { value: (d: { files?: File[] }) => !!d.files, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: async (d: { files: File[] }) => { w.sharedFiles.push(...d.files.map((f) => ({ name: f.name, size: f.size }))); },
      configurable: true,
    });
  });
  await page.goto('/#/ustawienia/kopia');
  await expect(page.getByText('Ostatnia kopia: jeszcze nie było')).toBeVisible();
  await page.getByRole('button', { name: 'Zrób kopię' }).click();
  await expect(page.getByRole('status')).toContainText('Kopia zapisana');
  const shared = await page.evaluate(() => (window as unknown as { sharedFiles: { name: string; size: number }[] }).sharedFiles);
  expect(shared).toHaveLength(1);
  expect(shared[0].name).toMatch(/^gym-kopia-\d{4}-\d{2}-\d{2}\.json$/);
  expect(shared[0].size).toBeGreaterThan(50);
  await expect(page.getByText(/Ostatnia kopia:.*dzisiaj/)).toBeVisible();
});

test('kalkulator talerzy z Ustawień i lista talerzy', async ({ page }) => {
  await page.goto('/#/ustawienia');
  const plates = page.getByRole('list', { name: 'Dostępne talerze' });
  await expect(plates.getByRole('listitem')).toHaveCount(7);
  await page.getByRole('button', { name: 'Usuń talerz 15 kg' }).click();
  await expect(plates.getByRole('listitem')).toHaveCount(6);
  await page.getByLabel('Nowy talerz (kg)').fill('0,5');
  await page.getByRole('button', { name: 'Dodaj talerz' }).click();
  await expect(plates).toContainText('0,5 kg');

  await page.getByRole('button', { name: /Kalkulator talerzy/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Kalkulator talerzy' });
  await dialog.getByLabel('Ciężar docelowy').fill('100');
  // without 15 kg plates: fewest plates = 20 + 20 per side
  await expect(dialog.getByRole('list', { name: 'Talerze' })).toHaveText(/^20\s*20$/);
  await expect(dialog.getByRole('button', { name: /^Użyj/ })).toHaveCount(0);
});
