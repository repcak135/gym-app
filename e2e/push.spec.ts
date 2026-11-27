import { test, expect, type Page } from '@playwright/test';

// Ustawienia › Koniec przerwy › "Powiadomienie przy zablokowanym ekranie", with the push server mocked.
const ID = 'e'.repeat(32);
const SWITCH = 'Powiadomienie przy zablokowanym ekranie';

/** Pretend to be the installed iPhone app with working push (the dev server has no service worker). */
async function installedApp(page: Page, permission: 'granted' | 'denied') {
  await page.addInitScript((perm) => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    const sub = { toJSON: () => ({ endpoint: 'https://web.push.apple.com/test', keys: { p256dh: 'p', auth: 'a' } }), unsubscribe: async () => true };
    const pushManager = { subscribe: async () => sub, getSubscription: async () => sub };
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve({ pushManager }), register: async () => ({}) }, configurable: true });
    (window as unknown as { PushManager: unknown }).PushManager = function PushManager() {};
    (window as unknown as { Notification: unknown }).Notification = { permission: 'default', requestPermission: async () => perm };
  }, permission);
}

async function mockServer(page: Page) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  await page.route('**/*.workers.dev/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    calls.push({ method: req.method(), path, body: req.postData() ? JSON.parse(req.postData()!) : null });
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, DELETE', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (req.method() === 'POST' && path === '/subscribe') await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ id: ID }) });
    else await route.fulfill({ status: 204, headers });
  });
  return calls;
}

test('push: in a Safari tab on iPhone the switch is off and explains the Home Screen', async ({ page }) => {
  await page.goto('/#/ustawienia');
  const sw = page.getByRole('switch', { name: SWITCH });
  await expect(sw).not.toBeChecked();
  await expect(sw).toBeDisabled();
  await expect(page.getByText('Na iPhonie działa tylko w aplikacji dodanej do ekranu początkowego')).toBeVisible();
  await expect(page.getByText(/wysyła na nasz serwer tylko anonimowy adres powiadomień/)).toBeVisible();
});

test('push: turning on registers the phone, survives a reload, turning off forgets it', async ({ page }) => {
  await installedApp(page, 'granted');
  const calls = await mockServer(page);
  await page.goto('/#/ustawienia');
  const sw = page.getByRole('switch', { name: SWITCH });
  await expect(sw).not.toBeChecked(); // off by default
  await sw.click();
  await expect(sw).toBeChecked();
  expect(calls[0]).toEqual({ method: 'POST', path: '/subscribe', body: { subscription: { endpoint: 'https://web.push.apple.com/test', keys: { p256dh: 'p', auth: 'a' } } } });
  await expect(page.getByText(/zamiast niego przyjdzie powiadomienie/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('switch', { name: SWITCH })).toBeChecked();

  await page.getByRole('switch', { name: SWITCH }).click();
  await expect(page.getByRole('switch', { name: SWITCH })).not.toBeChecked();
  await expect.poll(() => calls.find((c) => c.method === 'DELETE')).toEqual({ method: 'DELETE', path: '/subscribe', body: { id: ID } });
});

test('push: blocked notifications show how to allow them and keep the switch off', async ({ page }) => {
  await installedApp(page, 'denied');
  const calls = await mockServer(page);
  await page.goto('/#/ustawienia');
  await page.getByRole('switch', { name: SWITCH }).click();
  await expect(page.getByRole('alert')).toContainText('Powiadomienia są zablokowane');
  await expect(page.getByRole('switch', { name: SWITCH })).not.toBeChecked();
  expect(calls).toEqual([]);
});
