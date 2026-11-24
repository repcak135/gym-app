import { test, expect } from '@playwright/test';

test('ustawienia: domyślnie Delikatny dzwonek, wybór Gongu zostaje po odświeżeniu', async ({ page }) => {
  await page.goto('/#/ustawienia');
  await expect(page.getByRole('radio', { name: 'Delikatny dzwonek' })).toBeChecked();
  await page.getByRole('radio', { name: 'Gong' }).click();
  await expect(page.getByRole('radio', { name: 'Gong' })).toBeChecked();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Gong' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Delikatny dzwonek' })).not.toBeChecked();
});

test('ustawienia: Posłuchaj nie powoduje błędów; tryby bez dźwięku nie mają przycisku', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', (e) => errors.push(e));
  await page.goto('/#/ustawienia');
  await page.getByRole('button', { name: 'Posłuchaj: Gong' }).click();
  await page.getByRole('button', { name: 'Posłuchaj: Delikatny dzwonek' }).click();
  await page.getByRole('button', { name: 'Posłuchaj: Dwa krótkie tony' }).click();
  await page.getByRole('button', { name: 'Posłuchaj: Piknięcia (dawne)' }).click();
  await expect(page.getByRole('button', { name: /Posłuchaj: (Tylko wibracja|Cisza)/ })).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('ustawienia: odliczanie 3-2-1 domyślnie włączone i wyłącza się razem z dźwiękiem', async ({ page }) => {
  await page.goto('/#/ustawienia');
  const ticks = page.getByRole('switch', { name: 'Odliczanie 3-2-1 (ciche tyknięcia)' });
  await expect(ticks).toBeChecked();
  await ticks.click();
  await expect(ticks).not.toBeChecked(); // saved before the reload
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Odliczanie 3-2-1 (ciche tyknięcia)' })).not.toBeChecked();
  await page.getByRole('radio', { name: 'Tylko wibracja' }).click();
  await expect(page.getByRole('switch', { name: 'Odliczanie 3-2-1 (ciche tyknięcia)' })).toBeDisabled();
});
