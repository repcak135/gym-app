import { test, expect, type Page } from '@playwright/test';

// Statystyki › Ranking and Ustawienia › Konto with the ranking server mocked in memory.

type Member = { nick: string; key: string; salt: string; iterations: number; shareWorkouts: boolean; shareBench: boolean; mustChange: boolean };

async function mockServer(page: Page, seed: Member[] = []) {
  const members = new Map(seed.map((m) => [m.nick.toLowerCase(), m]));
  const sessions = new Map<string, string>();
  const scores = new Map<string, Record<string, number>>();
  const calls: { method: string; path: string; body: Record<string, unknown> | null; auth: string | null }[] = [];
  let n = 0;
  await page.route('**/*.workers.dev/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const body = req.postData() ? (JSON.parse(req.postData()!) as Record<string, unknown>) : null;
    const auth = req.headers()['authorization'] ?? null;
    calls.push({ method: req.method(), path: url.pathname, body, auth });
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, DELETE' };
    const json = (status: number, b?: unknown) => route.fulfill({ status, headers, contentType: 'application/json', body: b === undefined ? '' : JSON.stringify(b) });
    if (req.method() === 'OPTIONS') return json(204);
    const who = auth ? sessions.get(auth.replace('Bearer ', '')) : undefined;
    const route_ = `${req.method()} ${url.pathname}`;
    const newToken = (nick: string) => {
      const t = String(++n).padStart(32, '0');
      sessions.set(t, nick.toLowerCase());
      return t;
    };
    switch (route_) {
      case 'GET /account/salt': {
        const m = members.get((url.searchParams.get('nick') ?? '').toLowerCase());
        return m ? json(200, { salt: m.salt, iterations: m.iterations }) : json(404);
      }
      case 'POST /account/join': {
        const nick = String(body!.nick);
        if (members.has(nick.toLowerCase())) return json(409, { error: 'nick' });
        members.set(nick.toLowerCase(), { nick, key: String(body!.key), salt: String(body!.salt), iterations: Number(body!.iterations), shareWorkouts: !!body!.shareWorkouts, shareBench: !!body!.shareBench, mustChange: false });
        return json(200, { token: newToken(nick), nick });
      }
      case 'POST /account/login': {
        const m = members.get(String(body!.nick).toLowerCase());
        if (!m || m.key !== body!.key) return json(401);
        return json(200, { token: newToken(m.nick), nick: m.nick, shareWorkouts: m.shareWorkouts, shareBench: m.shareBench, mustChange: m.mustChange });
      }
    }
    if (!who) return json(401);
    const m = members.get(who)!;
    switch (route_) {
      case 'GET /account/me':
        return json(200, { nick: m.nick, shareWorkouts: m.shareWorkouts, shareBench: m.shareBench, mustChange: m.mustChange });
      case 'POST /account/password':
        Object.assign(m, { key: body!.key, salt: body!.salt, mustChange: false });
        return json(204);
      case 'POST /account/sharing':
        Object.assign(m, { shareWorkouts: body!.shareWorkouts, shareBench: body!.shareBench });
        return json(204);
      case 'POST /scores':
        scores.set(who, body as Record<string, number>);
        return json(204);
      case 'DELETE /account':
        members.delete(who);
        return json(204);
      case 'DELETE /account/session':
        sessions.delete(auth!.replace('Bearer ', ''));
        return json(204);
      case 'GET /ranking': {
        const rows = (k: 'workoutsWeek' | 'workoutsMonth') =>
          [...members.values()].filter((x) => x.shareWorkouts).map((x) => ({ nick: x.nick, value: scores.get(x.nick.toLowerCase())?.[k] ?? 0 })).sort((a, b) => b.value - a.value);
        return json(200, {
          me: m.nick,
          week: { workouts: [{ nick: 'Rywal', value: 9 }, ...rows('workoutsWeek')], bench: [{ nick: 'Rywal', value: 312.4 }] },
          month: { workouts: rows('workoutsMonth'), bench: [] },
        });
      }
    }
    return json(404);
  });
  return { calls, members };
}

async function joinAs(page: Page, nick: string) {
  await page.goto('/#/statystyki/ranking');
  await page.getByLabel('Nick').fill(nick);
  await page.getByLabel('Hasło (min. 8 znaków)').fill('tajne-haslo-1');
  await page.getByLabel('Powtórz hasło').fill('tajne-haslo-1');
  await page.getByLabel('Kobieta').check();
  await page.getByLabel('Twoja aktualna waga ciała (kg) — do punktów, zapisze się w Ciało i nie trafi na serwer').fill('61,5');
  await page.getByRole('button', { name: 'Dołącz do rankingu' }).click();
}

test('ranking: join with a nick, both tables show, nothing private is sent', async ({ page }) => {
  const { calls } = await mockServer(page);
  await page.goto('/#/statystyki');
  await page.getByRole('link', { name: 'Ranking znajomych' }).click();
  await expect(page.getByText('Ranking jest dobrowolny')).toBeVisible();
  await joinAs(page, 'Ola_ż');
  await expect(page.getByRole('region', { name: 'Treningi' })).toContainText('Ola_ż');
  await expect(page.getByRole('region', { name: 'Treningi' })).toContainText('Rywal');
  await expect(page.getByRole('region', { name: 'Ławka (DOTS)' })).toContainText('312,4');
  await expect(page.locator('.rank-row--me')).toContainText('Ola_ż');
  await page.getByRole('tab', { name: 'Miesiąc' }).click();
  await expect(page.getByRole('region', { name: 'Ławka (DOTS)' })).toContainText('Nikt jeszcze nie ma wyniku');

  const join = calls.find((c) => c.path === '/account/join')!;
  expect(Object.keys(join.body!).sort()).toEqual(['iterations', 'key', 'nick', 'salt', 'shareBench', 'shareWorkouts']);
  const everything = JSON.stringify(calls.map((c) => c.body));
  expect(everything).not.toContain('tajne-haslo-1');
  expect(everything).not.toContain('61.5');
  expect(everything).not.toMatch(/"(sex|weight|bodyKg|rankSex)"/);
  // The weight went to Ciało on the phone.
  await page.goto('/#/statystyki');
  await page.getByRole('tab', { name: 'Ciało' }).click();
  await expect(page.getByText('61,5').first()).toBeVisible();
});

test('ranking: a taken nick shows a clear message', async ({ page }) => {
  await mockServer(page, [{ nick: 'Bartek', key: 'x', salt: 'AAAAAAAAAAAAAAAAAAAAAA', iterations: 300000, shareWorkouts: true, shareBench: false, mustChange: false }]);
  await joinAs(page, 'bartek');
  await expect(page.getByRole('alert')).toContainText('Ten nick jest już zajęty');
});

test('konto: sharing switch, leave ranking returns to the join form', async ({ page }) => {
  const { calls, members } = await mockServer(page);
  await joinAs(page, 'Kuba');
  await expect(page.getByRole('region', { name: 'Treningi' })).toBeVisible();
  await page.goto('/#/ustawienia');
  await expect(page.getByText('Kuba', { exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Pokazuj punkty z ławki' }).click();
  await expect(page.getByRole('switch', { name: 'Pokazuj punkty z ławki' })).not.toBeChecked();
  expect(calls.find((c) => c.path === '/account/sharing')!.body).toEqual({ shareWorkouts: true, shareBench: false });
  await page.getByRole('button', { name: 'Opuść ranking i usuń konto' }).click();
  await page.getByRole('button', { name: 'Tak, opuść ranking' }).click();
  await expect(page.getByRole('link', { name: 'Ranking znajomych' })).toBeVisible();
  expect(members.size).toBe(0);
  await page.goto('/#/statystyki/ranking');
  await expect(page.getByRole('button', { name: 'Dołącz do rankingu' })).toBeVisible();
});

test('login after an admin reset asks for a new password first', async ({ page }) => {
  const { members } = await mockServer(page);
  // Create the member through the app, then simulate the admin reset.
  await joinAs(page, 'Ewa');
  await expect(page.getByRole('region', { name: 'Treningi' })).toBeVisible();
  await page.goto('/#/ustawienia');
  await page.getByRole('button', { name: 'Wyloguj z tego telefonu' }).click();
  await expect(page.getByRole('link', { name: 'Ranking znajomych' })).toBeVisible();
  members.get('ewa')!.mustChange = true;

  await page.goto('/#/statystyki/ranking');
  await page.getByRole('tab', { name: 'Mam już konto' }).click();
  await page.getByLabel('Nick').fill('Ewa');
  await page.getByLabel('Hasło (min. 8 znaków)').fill('tajne-haslo-1');
  await page.getByRole('button', { name: 'Zaloguj' }).click();
  await expect(page.getByText('Zalogowano hasłem tymczasowym')).toBeVisible();
  await page.getByLabel('Nowe hasło (min. 8 znaków)').fill('nowe-haslo-22');
  await page.getByLabel('Powtórz nowe hasło').fill('nowe-haslo-22');
  await page.getByRole('button', { name: 'Zapisz nowe hasło' }).click();
  await expect(page.getByRole('region', { name: 'Treningi' })).toBeVisible();
  expect(members.get('ewa')!.mustChange).toBe(false);
});
