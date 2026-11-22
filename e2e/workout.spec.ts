import { test, expect, type Page } from '@playwright/test';

const BENCH = 'Barbell Bench Press - Medium Grip';
const SQUAT = 'Barbell Squat';

async function pickExercise(page: Page, dialogName: string, query: string, name: string) {
  const picker = page.getByRole('dialog', { name: dialogName });
  await picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill(query);
  await picker.getByRole('button', { name, exact: true }).click({ timeout: 15_000 });
}

/** Plan "Plan" with day "Day 1 Upper" holding bench + squat (defaults 3 × 8–12, rest 2:00). */
async function planWithDay(page: Page) {
  await page.goto('/#/plany');
  await page.getByRole('button', { name: 'Nowy plan' }).click();
  await page.getByRole('dialog', { name: 'Nowy plan' }).getByLabel('Nazwa').fill('Plan');
  await page.getByRole('dialog', { name: 'Nowy plan' }).getByRole('button', { name: 'Zapisz' }).click();
  await page.getByRole('button', { name: 'Dodaj dzień' }).click();
  await page.getByRole('dialog', { name: 'Nowy dzień' }).getByLabel('Nazwa').fill('Day 1 Upper');
  await page.getByRole('dialog', { name: 'Nowy dzień' }).getByRole('button', { name: 'Zapisz' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenia' }).click();
  await pickExercise(page, 'Dodaj ćwiczenia', 'barbell bench press', BENCH);
  await pickExercise(page, 'Dodaj ćwiczenia', 'squat', SQUAT);
  await page.getByRole('button', { name: 'Gotowe (2)' }).click();
}

function panel(page: Page, name: string) {
  return page.getByRole('region', { name });
}

test('trening z planu: wartości, zaliczenie serii, przerwa, wznowienie po zamknięciu', async ({ page }) => {
  await planWithDay(page);
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Rozpocznij trening' }).click();
  await expect(page).toHaveURL(/#\/trening$/);
  await expect(page.getByRole('navigation', { name: 'Główne menu' })).toHaveCount(0);

  const bench = panel(page, BENCH);
  await expect(bench.getByRole('list', { name: 'Serie' }).getByRole('listitem')).toHaveCount(3);

  // weight: + uses the 2,5 kg step, then typed value with a comma
  await bench.getByRole('button', { name: 'Więcej kg' }).click();
  await expect(bench.getByLabel('Ciężar')).toHaveValue('2,5');
  await bench.getByLabel('Ciężar').fill('37,5');
  await bench.getByRole('button', { name: 'Więcej powtórzeń' }).click();
  await bench.getByRole('button', { name: 'Zalicz serię' }).click();

  await expect(bench.getByRole('button', { name: 'Seria 1: 37,5 kg × 9, zaliczona' })).toBeVisible();
  const rest = page.getByRole('timer', { name: 'Przerwa' });
  await expect(rest).toContainText(/[12]:\d\d/);

  // second set is selected next; +15 s then skip
  await expect(bench.getByRole('button', { name: /Seria 2/ })).toHaveAttribute('aria-current', 'true');
  await rest.getByRole('button', { name: '+15 s' }).click();
  await expect(rest).toContainText(/2:1\d/);

  // app closed and reopened at Start: back on the workout, rest and set still there
  await page.goto('/#/');
  await page.reload();
  await expect(page).toHaveURL(/#\/trening$/);
  await expect(panel(page, BENCH).getByRole('button', { name: 'Seria 1: 37,5 kg × 9, zaliczona' })).toBeVisible();
  await expect(page.getByRole('timer', { name: 'Przerwa' })).toBeVisible();
  await page.getByRole('timer', { name: 'Przerwa' }).getByRole('button', { name: 'Pomiń' }).click();
  await expect(page.getByRole('timer', { name: 'Przerwa' })).toHaveCount(0);

  // second exercise via the dots; position survives a reload
  await page.getByRole('button', { name: `Ćwiczenie 2: ${SQUAT}` }).click();
  await expect(page.getByRole('button', { name: `Ćwiczenie 2: ${SQUAT}` })).toHaveAttribute('aria-current', 'step');
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByRole('button', { name: `Ćwiczenie 2: ${SQUAT}` })).toHaveAttribute('aria-current', 'step');
  await expect(panel(page, SQUAT)).toBeVisible();
});

test('pusty trening: dodaj ćwiczenie, zakończ, podsumowanie; następny trening podpowiada wartości', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Pusty trening' }).click();
  await expect(page).toHaveURL(/#\/trening$/);
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  await pickExercise(page, 'Dodaj ćwiczenia', 'barbell bench press', BENCH);
  await page.getByRole('button', { name: 'Gotowe (1)' }).click();

  const bench = panel(page, BENCH);
  await bench.getByLabel('Ciężar').fill('60');
  await bench.getByLabel('Powtórzenia').fill('12');
  await bench.getByRole('button', { name: 'Zalicz serię' }).click();
  await expect(bench.getByRole('button', { name: 'Seria 1: 60 kg × 12, zaliczona' })).toBeVisible();

  await page.getByRole('button', { name: 'Zakończ' }).click();
  await page.getByRole('dialog', { name: 'Zakończyć trening?' }).getByRole('button', { name: 'Zakończ trening' }).click();
  await expect(page).toHaveURL(/#\/trening\/podsumowanie\//);
  await expect(page.getByText('Trening zakończony')).toBeVisible();
  await expect(page.getByText('720 kg')).toBeVisible();
  await expect(page.getByText('Tym razem bez nowych rekordów.')).toBeVisible();
  await page.getByRole('link', { name: 'Gotowe' }).click();
  await expect(page).toHaveURL(/#\/$/);

  // second workout: prefilled from the first, hint (60 × 12 = top of 8–12) suggests +2,5 kg
  await page.getByRole('button', { name: 'Pusty trening' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  await pickExercise(page, 'Dodaj ćwiczenia', 'barbell bench press', BENCH);
  await page.getByRole('button', { name: 'Gotowe (1)' }).click();
  const bench2 = panel(page, BENCH);
  await expect(bench2.getByText('Ostatnio: 60×12')).toBeVisible();
  await expect(bench2.getByText('Spróbuj 62,5 kg × 8–10 (ostatnio pełny zakres przy 60 kg)')).toBeVisible();
  // prefilled with the new weight from the bottom of the range
  await expect(bench2.getByLabel('Ciężar')).toHaveValue('62,5');
  await expect(bench2.getByLabel('Powtórzenia')).toHaveValue('8');
  await bench2.getByRole('button', { name: 'Historia' }).click();
  await expect(page.getByRole('dialog', { name: BENCH })).toContainText('60 × 12');
  await page.getByRole('dialog', { name: BENCH }).getByRole('button', { name: 'Zamknij' }).click();

  await bench2.getByRole('button', { name: 'Zalicz serię' }).click();
  await page.getByRole('button', { name: 'Zakończ' }).click();
  await page.getByRole('dialog', { name: 'Zakończyć trening?' }).getByRole('button', { name: 'Zakończ trening' }).click();
  await expect(page.getByRole('region', { name: 'Nowe rekordy' })).toContainText('najcięższa seria 62,5 kg');
});

test('zamiana i usuwanie ćwiczenia, pusty trening bez serii można usunąć', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Pusty trening' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  await pickExercise(page, 'Dodaj ćwiczenia', 'barbell bench press', BENCH);
  await page.getByRole('button', { name: 'Gotowe (1)' }).click();
  await expect(panel(page, BENCH)).toBeVisible();

  await page.getByRole('button', { name: 'Opcje treningu' }).click();
  await page.getByRole('button', { name: `Zamień: ${BENCH}` }).click();
  await pickExercise(page, `Zamień: ${BENCH}`, 'squat', SQUAT);
  await expect(panel(page, SQUAT)).toBeVisible();
  await expect(panel(page, BENCH)).toHaveCount(0);

  await page.getByRole('button', { name: 'Opcje treningu' }).click();
  await page.getByRole('button', { name: `Usuń: ${SQUAT}` }).click();
  await page.getByRole('button', { name: 'Usuń ćwiczenie' }).click();
  await expect(page.getByText('Pusty trening. Dodaj pierwsze ćwiczenie.')).toBeVisible();

  await page.getByRole('button', { name: 'Zakończ' }).click();
  await page.getByRole('button', { name: 'Zakończ trening' }).click();
  await expect(page.getByRole('dialog', { name: 'Brak zaliczonych serii' })).toBeVisible();
  await page.getByRole('button', { name: 'Usuń trening' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('button', { name: 'Pusty trening' })).toBeVisible();
});

async function emptyWorkoutWithBench(page: Page) {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Pusty trening' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  await pickExercise(page, 'Dodaj ćwiczenia', 'barbell bench press', BENCH);
  await page.getByRole('button', { name: 'Gotowe (1)' }).click();
  await expect(panel(page, BENCH)).toBeVisible();
}

test('koniec przerwy: duży napis, znika po dotknięciu i nie wraca po przeładowaniu', async ({ page }) => {
  await page.clock.install();
  await emptyWorkoutWithBench(page);
  await panel(page, BENCH).getByRole('button', { name: 'Zalicz serię' }).click();
  await expect(page.getByRole('timer', { name: 'Przerwa' })).toBeVisible();

  await page.clock.fastForward('02:01'); // default rest 2:00
  const banner = page.getByRole('alert');
  await expect(banner).toContainText('Koniec przerwy!');
  await expect(page.getByRole('timer', { name: 'Przerwa' })).toHaveCount(0);
  await banner.click();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.reload();
  await expect(panel(page, BENCH)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('koniec przerwy, gdy aplikacja była w tle: napis po powrocie; Pomiń nie pokazuje napisu', async ({ page }) => {
  await page.clock.install();
  await emptyWorkoutWithBench(page);
  await panel(page, BENCH).getByRole('button', { name: 'Zalicz serię' }).click();
  await expect(page.getByRole('timer', { name: 'Przerwa' })).toBeVisible();

  // leave the workout screen (like closing the app), let the rest run out, come back
  await page.getByRole('link', { name: /Wróć na Start/ }).click();
  await page.clock.fastForward('05:00');
  await page.getByRole('link', { name: 'Wróć do treningu' }).click();
  await expect(page.getByRole('alert')).toContainText('Koniec przerwy!');
  await page.clock.fastForward('00:06'); // dismisses itself
  await expect(page.getByRole('alert')).toHaveCount(0);

  // skipping the rest on purpose: no banner
  await panel(page, BENCH).getByRole('button', { name: 'Zalicz serię' }).click();
  await page.getByRole('timer', { name: 'Przerwa' }).getByRole('button', { name: 'Pomiń' }).click();
  await page.clock.fastForward('03:00');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('ustawienia: dźwięk i wibracja końca przerwy można wyłączyć', async ({ page }) => {
  await page.goto('/#/ustawienia');
  const sound = page.getByRole('switch', { name: 'Dźwięk końca przerwy' });
  const vibration = page.getByRole('switch', { name: 'Wibracja' });
  await expect(sound).toBeChecked();
  await expect(vibration).toBeChecked();
  await sound.click();
  await expect(sound).not.toBeChecked();
  await vibration.click();
  await expect(vibration).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Dźwięk końca przerwy' })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'Wibracja' })).not.toBeChecked();
});

test('RIR: domyślnie ukryte; po włączeniu zapisuje się przy serii i widać je w historii', async ({ page }) => {
  await emptyWorkoutWithBench(page);
  await expect(panel(page, BENCH).getByRole('group', { name: /RIR/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Opcje treningu' }).click();
  await page.getByRole('button', { name: 'Anuluj trening' }).click();
  await page.getByRole('button', { name: 'Usuń trening' }).click();
  await expect(page.getByRole('button', { name: 'Pusty trening' })).toBeVisible();

  await page.goto('/#/ustawienia');
  await page.getByRole('switch', { name: 'Pokaż RIR (zaawansowane)' }).click();
  await expect(page.getByRole('switch', { name: 'Pokaż RIR (zaawansowane)' })).toBeChecked();

  await emptyWorkoutWithBench(page);
  const bench = panel(page, BENCH);
  await bench.getByLabel('Ciężar').fill('35');
  await bench.getByLabel('Powtórzenia', { exact: true }).fill('8');
  await bench.getByRole('button', { name: 'RIR 1', exact: true }).click();
  await expect(bench.getByRole('button', { name: 'RIR 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await bench.getByRole('button', { name: 'Zalicz serię' }).click();
  await expect(bench.getByRole('button', { name: 'Seria 1: 35 kg × 8, RIR 1, zaliczona' })).toBeVisible();
  await page.getByRole('timer', { name: 'Przerwa' }).getByRole('button', { name: 'Pomiń' }).click();
  await page.getByRole('button', { name: 'Zakończ' }).click();
  await page.getByRole('button', { name: 'Zakończ trening' }).click();
  await page.getByRole('link', { name: 'Gotowe' }).click();

  await emptyWorkoutWithBench(page);
  const bench2 = panel(page, BENCH);
  await expect(bench2.getByText('Ostatnio: 35×8 (RIR 1)')).toBeVisible();
  await bench2.getByRole('button', { name: 'Historia' }).click();
  await expect(page.getByRole('dialog', { name: BENCH })).toContainText('35 × 8 · RIR 1');
});
