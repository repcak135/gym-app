import { test, expect } from '@playwright/test';

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('ciało: dodaj pomiary, zmiana od startu, wykres, edycja i usunięcie', async ({ page }) => {
  await page.goto('/#/statystyki');
  await page.getByRole('tab', { name: 'Ciało' }).click();
  await expect(page.getByText(/Wpisz wagę albo obwody/)).toBeVisible();

  // first entry today: weight + waist; empty fields are not saved
  await page.getByRole('button', { name: 'Dodaj pomiar' }).click();
  const sheet = page.getByRole('dialog', { name: 'Dodaj pomiar' });
  await sheet.getByRole('button', { name: 'Zapisz' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Wpisz przynajmniej jedną wartość');
  await sheet.getByLabel('Waga').fill('82,5');
  await sheet.getByLabel('Talia').fill('85');
  await sheet.getByRole('button', { name: 'Zapisz' }).click();
  await expect(sheet).toBeHidden();

  const metrics = page.getByRole('list', { name: 'Wymiary' });
  await expect(metrics.getByRole('listitem')).toHaveCount(2);
  await expect(metrics).toContainText('82,5 kg');
  await expect(metrics).toContainText('85 cm');

  // an older entry becomes the start: 84 → 82,5 = −1,5 kg
  await page.getByRole('button', { name: 'Dodaj pomiar' }).click();
  const sheet2 = page.getByRole('dialog', { name: 'Dodaj pomiar' });
  await sheet2.getByLabel('Data').fill(isoDaysAgo(30));
  await sheet2.getByLabel('Waga').fill('84');
  await sheet2.getByRole('button', { name: 'Zapisz' }).click();
  await expect(metrics.getByRole('button', { name: /Waga/ })).toContainText('−1,5 kg od startu');
  await expect(page.getByRole('list', { name: 'Wszystkie wpisy' }).getByRole('listitem')).toHaveCount(2);

  // metric view with chart
  await metrics.getByRole('button', { name: /Waga/ }).click();
  await expect(page.getByRole('heading', { name: /Waga/ })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Waga w czasie' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Ostatnio' })).toContainText('82,5 kg');
  await expect(page.getByRole('group', { name: 'Zmiana' })).toContainText('−1,5 kg');

  // edit the latest weight
  await page.getByRole('list', { name: 'Pomiary: Waga' }).getByRole('button', { name: /82,5 kg/ }).click();
  const edit = page.getByRole('dialog', { name: 'Edytuj pomiar' });
  await edit.getByLabel('Waga').fill('81');
  await edit.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('group', { name: 'Ostatnio' })).toContainText('81 kg');

  // delete the older entry
  await page.getByRole('list', { name: 'Pomiary: Waga' }).getByRole('button', { name: /84 kg/ }).click();
  await page.getByRole('dialog', { name: 'Edytuj pomiar' }).getByRole('button', { name: 'Usuń wpis' }).click();
  await page.getByRole('dialog', { name: 'Usunąć ten pomiar?' }).getByRole('button', { name: 'Usuń' }).click();
  await expect(page.getByRole('list', { name: 'Pomiary: Waga' }).getByRole('listitem')).toHaveCount(1);

  // back to the overview; the tab is remembered after visiting another tab
  await page.getByRole('button', { name: 'Wszystkie wymiary' }).click();
  await expect(page.getByRole('list', { name: 'Wszystkie wpisy' }).getByRole('listitem')).toHaveCount(1);
});
