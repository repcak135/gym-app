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
  await expect(
    bench2.getByText('Ostatnio 12, czyli górna granica — weź 2,5 kg więcej i zacznij od 8'),
  ).toBeVisible();
  // prefilled with the new weight from the bottom of the range
  await expect(bench2.getByLabel('Ciężar')).toHaveValue('62,5');
  await expect(bench2.getByLabel('Powtórzenia')).toHaveValue('8');
  await bench2.getByRole('button', { name: 'Historia' }).click();
  await expect(page.getByRole('dialog', { name: BENCH })).toContainText('60 kg × 12 powt.');
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

test('ustawienia: cisza i wibracja końca przerwy można wyłączyć', async ({ page }) => {
  await page.goto('/#/ustawienia');
  const silent = page.getByRole('radio', { name: 'Cisza (tylko napis)' });
  const vibration = page.getByRole('switch', { name: 'Wibracja' });
  await expect(vibration).toBeChecked();
  await silent.click();
  await expect(silent).toBeChecked();
  await vibration.click();
  await expect(vibration).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Cisza (tylko napis)' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Wibracja' })).not.toBeChecked();
});

test('RIR: domyślnie ukryte; po włączeniu zapisuje się przy serii i widać je w historii', async ({ page }) => {
  await emptyWorkoutWithBench(page);
  await expect(panel(page, BENCH).getByRole('button', { name: /Trudność serii/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Opcje treningu' }).click();
  await page.getByRole('button', { name: 'Anuluj trening' }).click();
  await page.getByRole('button', { name: 'Usuń trening' }).click();
  await expect(page.getByRole('button', { name: 'Pusty trening' })).toBeVisible();

  await page.goto('/#/ustawienia');
  await page.getByRole('switch', { name: 'Ocena trudności serii (RPE/RIR)' }).click();
  await expect(page.getByRole('switch', { name: 'Ocena trudności serii (RPE/RIR)' })).toBeChecked();

  await emptyWorkoutWithBench(page);
  const bench = panel(page, BENCH);
  await bench.getByLabel('Ciężar').fill('35');
  await bench.getByLabel('Powtórzenia', { exact: true }).fill('8');
  await expect(bench.getByRole('button', { name: 'Trudność serii: oceń' })).toHaveText('Oceń');
  await bench.getByRole('button', { name: 'Trudność serii: oceń' }).click();
  const sheet = page.getByRole('dialog', { name: 'Jak ciężka była ta seria?' });
  await expect(sheet).toContainText('35 kg × 8');
  await sheet.getByRole('radio', { name: /^RPE 8 — Ciężko/ }).click();
  await expect(sheet).toHaveCount(0);
  await expect(bench.getByRole('button', { name: 'Trudność serii: RPE 8' })).toHaveText('RPE 8');
  await bench.getByRole('button', { name: 'Zalicz serię' }).click();
  await expect(bench.getByRole('button', { name: 'Seria 1: 35 kg × 8, RPE 8, zaliczona' })).toBeVisible();
  await page.getByRole('timer', { name: 'Przerwa' }).getByRole('button', { name: 'Pomiń' }).click();
  // second set as a warm-up (shown as "Rozgrzewka" in the history)
  await bench.getByLabel('Ciężar').fill('20');
  await bench.getByLabel('Powtórzenia', { exact: true }).fill('10');
  await bench.getByRole('checkbox', { name: 'Rozgrzewka' }).click();
  await bench.getByRole('button', { name: 'Zalicz serię' }).click();
  await page.getByRole('button', { name: 'Zakończ' }).click();
  await page.getByRole('button', { name: 'Zakończ trening' }).click();
  await page.getByRole('link', { name: 'Gotowe' }).click();

  await emptyWorkoutWithBench(page);
  const bench2 = panel(page, BENCH);
  await expect(bench2.getByText('Ostatnio: 35×8 (RPE 8)')).toBeVisible();
  await bench2.getByRole('button', { name: 'Historia' }).click();
  const sets = page.getByRole('dialog', { name: BENCH }).getByRole('list', { name: /^Serie: / }).getByRole('listitem');
  await expect(sets).toHaveCount(2);
  // numbered rows; warm-up marked, difficulty as RPE
  await expect(sets.filter({ hasText: '35 kg × 8 powt.' })).toContainText('RPE 8');
  await expect(sets.filter({ hasText: '20 kg × 10 powt.' })).toContainText('Rozgrzewka');
  await expect(sets.nth(0).locator('.xhist__n')).toHaveText('1');
  await expect(sets.nth(1).locator('.xhist__n')).toHaveText('2');
  // the exercise card shows the same history
  await page.getByRole('dialog', { name: BENCH }).getByRole('button', { name: 'Zamknij' }).click();
  await page.getByRole('button', { name: 'Opcje treningu' }).click();
  await page.getByRole('button', { name: 'Anuluj trening' }).click();
  await page.getByRole('button', { name: 'Usuń trening' }).click();
  await expect(page.getByRole('button', { name: 'Pusty trening' })).toBeVisible();
  await page.goto('/#/cwiczenia');
  await page.getByPlaceholder('Szukaj ćwiczenia').fill('barbell bench press');
  await page.getByRole('link', { name: BENCH, exact: true }).click();
  const card = page.getByRole('region', { name: 'Historia' });
  await expect(card.getByRole('list', { name: /^Serie: / }).getByRole('listitem').first()).toContainText('RPE 8');
  await expect(card).toContainText('Rozgrzewka');
});

test('trudność: ustawienie „pytaj po zaliczeniu” otwiera arkusz, X zamyka, przejście dalej dopiero po zamknięciu', async ({ page }) => {
  await page.goto('/#/ustawienia');
  const ask = page.getByRole('switch', { name: 'Pytaj o trudność po zaliczeniu serii' });
  await expect(ask).toBeDisabled();
  await page.getByRole('switch', { name: 'Ocena trudności serii (RPE/RIR)' }).click();
  await expect(ask).toBeEnabled();
  await ask.click();
  await expect(ask).toBeChecked();

  await emptyWorkoutWithBench(page);
  const bench = panel(page, BENCH);
  const sheet = page.getByRole('dialog', { name: 'Jak ciężka była ta seria?' });

  // set 1: sheet appears, X closes it without a rating
  await bench.getByRole('button', { name: 'Zalicz serię' }).click();
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('timer', { name: 'Przerwa' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Zamknij' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(bench.getByRole('button', { name: /^Seria 1: .*zaliczona$/ })).not.toContainText('RPE');

  // set 2: pick a level
  await bench.getByRole('button', { name: 'Zalicz serię' }).click();
  await sheet.getByRole('radio', { name: /^RPE 9 — / }).click();
  await expect(bench.getByRole('button', { name: /^Seria 2: .*RPE 9, zaliczona$/ })).toBeVisible();

  // last set: the auto-advance (list view for a single exercise) waits for the sheet
  await bench.getByRole('button', { name: 'Zalicz serię' }).click();
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.getByRole('list', { name: 'Lista ćwiczeń' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Zamknij' }).click();
  await expect(page.getByRole('list', { name: 'Lista ćwiczeń' })).toBeVisible();
});

/** Puts rows straight into the app's IndexedDB (same helper idea as polish.spec.ts). */
async function seedDb(page: Page, data: { plans?: unknown[]; workouts?: unknown[]; sets?: unknown[] }) {
  await page.goto('/#/');
  await expect(page.getByRole('navigation')).toBeVisible();
  await page.evaluate(async (d) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('gym-app');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const stores = [...Object.keys(d).filter((k) => (d as Record<string, unknown[]>)[k]?.length), 'settings'];
        const tx = db.transaction(stores, 'readwrite');
        for (const s of stores) for (const row of (d as Record<string, unknown[]>)[s] ?? []) tx.objectStore(s).put(row);
        // keep the existing settings row (exercise db version etc.), only add the active plan
        const st = tx.objectStore('settings');
        const get = st.get('app');
        get.onsuccess = () => st.put({ ...(get.result ?? { key: 'app' }), activePlanId: 'p1' });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, data);
}

/** Plan with one day (exercise x-prog, 2 × 8–12) and `sessions` finished workouts of [30×12, 30×10], oldest first. */
async function seedProgression(page: Page, sessions: number) {
  const day = 24 * 3600_000;
  const base = new Date('2026-10-01T18:00:00').getTime();
  const workouts = [];
  const sets = [];
  for (let k = 0; k < sessions; k++) {
    const at = base + k * 3 * day;
    workouts.push({ id: `w${k}`, name: 'Day 1', startedAt: at, endedAt: at + 3600_000, source: 'app' });
    [12, 10].forEach((reps, i) =>
      sets.push({
        id: `s${k}-${i}`, workoutId: `w${k}`, exerciseId: 'x-prog', exerciseOrder: 0, setOrder: i + 1,
        weight: 30, reps, warmup: false, completedAt: at + (i + 1) * 60_000,
      }),
    );
  }
  await seedDb(page, {
    plans: [{
      id: 'p1', name: 'Plan', startedAt: '2026-10-01',
      days: [{ id: 'd1', name: 'Day 1', items: [{ exerciseId: 'x-prog', sets: 2, warmupSets: 0, repsMin: 8, repsMax: 12, restSec: 120 }] }],
    }],
    workouts,
    sets,
  });
  await page.reload();
  await page.getByRole('button', { name: 'Rozpocznij trening' }).click();
  await expect(page).toHaveURL(/#\/trening$/);
}

test('podpowiedź per seria: wartości, powód i arkusz „Jak działa podpowiedź?”', async ({ page }) => {
  await seedProgression(page, 1);
  const ex = page.getByRole('region').first();
  await expect(ex.getByLabel('Ciężar')).toHaveValue('32,5');
  await expect(ex.getByLabel('Powtórzenia')).toHaveValue('8');
  await expect(ex.getByText('górna granica')).toBeVisible();
  await expect(page.getByText('3 treningi bez postępu')).toHaveCount(0);

  await ex.getByRole('button', { name: 'Jak działa podpowiedź?' }).click();
  const dialog = page.getByRole('dialog', { name: 'Jak działa podpowiedź?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Jak działa podpowiedź?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Zamknij' }).click();
  await expect(dialog).toHaveCount(0);

  // set 2 has its own target: 30 × 10 -> 30 × 11
  await ex.getByRole('button', { name: /^Seria 2/ }).click();
  await expect(ex.getByLabel('Ciężar')).toHaveValue('30');
  await expect(ex.getByLabel('Powtórzenia')).toHaveValue('11');
});

test('3 treningi bez postępu: „Zastosuj −10%” zmniejsza ciężar tylko w tym treningu', async ({ page }) => {
  await seedProgression(page, 4);
  const ex = page.getByRole('region').first();
  await expect(ex.getByText('3 treningi bez postępu')).toBeVisible();
  await expect(ex.getByLabel('Ciężar')).toHaveValue('32,5');
  await ex.getByRole('button', { name: 'Zastosuj −10%' }).click();
  await expect(ex.getByText('Ciężar zmniejszony o ok. 10% na ten trening')).toBeVisible();
  await expect(ex.getByLabel('Ciężar')).toHaveValue('27,5');
});

test('ustawienia: cel wysiłku „Z zapasem” zapisuje się po przeładowaniu', async ({ page }) => {
  await page.goto('/#/ustawienia');
  await expect(page.getByRole('radio', { name: 'Blisko upadku — 1–2 w zapasie' })).toBeChecked();
  await page.getByRole('radio', { name: 'Z zapasem — 2–3 w zapasie' }).click();
  await expect(page.getByRole('radio', { name: 'Z zapasem — 2–3 w zapasie' })).toBeChecked();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Z zapasem — 2–3 w zapasie' })).toBeChecked();
});

test('generator rozgrzewki: 100 kg na sztandze daje R1–R4 przed serią 1', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Pusty trening' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  await pickExercise(page, 'Dodaj ćwiczenia', 'barbell bench press', BENCH);
  await page.getByRole('button', { name: 'Gotowe (1)' }).click();

  const bench = panel(page, BENCH);
  await bench.getByLabel('Ciężar').fill('100');
  await bench.getByRole('button', { name: 'Rozgrzewka', exact: true }).click();

  const sheet = page.getByRole('dialog', { name: 'Rozgrzewka przed 100 kg' });
  await expect(sheet.getByRole('listitem')).toHaveCount(4);
  await expect(sheet.getByRole('listitem').first()).toContainText('20 kg × 10');
  await sheet.getByRole('button', { name: 'Dodaj rozgrzewkę' }).click();
  await expect(sheet).toHaveCount(0);

  const rows = bench.getByRole('list', { name: 'Serie' }).getByRole('listitem');
  await expect(rows).toHaveCount(7);
  await expect(rows.nth(0)).toContainText('R1');
  await expect(rows.nth(0)).toContainText('20 kg × 10');
  await expect(rows.nth(3)).toContainText('R4');
  await expect(rows.nth(3)).toContainText('80 kg × 3');
  await expect(rows.nth(4)).toHaveText(/^1/);
});
