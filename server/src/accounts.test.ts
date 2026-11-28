// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { nodeD1 } from './d1-node';
import { handle, type Env } from './index';

const ORIGIN = 'https://repcak135.github.io';
const NOW = 1_800_000_000_000;
const SALT = 'AAAAAAAAAAAAAAAAAAAAAA'; // 22 chars = 16 bytes
const KEY_A = 'a'.repeat(43);
const KEY_B = 'b'.repeat(43);
const WEEK = '2026-W48';
const MONTH = '2026-11';

let env: Env;
let now: number;

beforeEach(() => {
  env = { DB: nodeD1(new URL('../migrations/', import.meta.url)), ADMIN_TOKEN: 'admin-secret-0123456789', SALT_SECRET: 'salt-secret-test' } as unknown as Env;
  now = NOW;
});

async function call(method: string, path: string, body?: unknown, opts: { token?: string; ip?: string; origin?: string | null; raw?: string } = {}) {
  const headers: Record<string, string> = { 'CF-Connecting-IP': opts.ip ?? '1.1.1.1' };
  if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN;
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await handle(
    new Request(`https://w.example${path}`, { method, headers, body: opts.raw ?? (body === undefined ? undefined : JSON.stringify(body)) }),
    env,
    now,
  );
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

const join = (nick: string, extra: object = {}, ip?: string) =>
  call('POST', '/account/join', { nick, salt: SALT, iterations: 300_000, key: KEY_A, shareWorkouts: true, shareBench: true, ...extra }, { ip });

describe('accounts', () => {
  it('join → salt → login → me', async () => {
    const j = await join('Bartek_ż');
    expect(j.status).toBe(200);
    expect(j.json.token).toMatch(/^[0-9a-f]{32}$/);
    expect(j.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect((await call('GET', '/account/salt?nick=bartek_Ż')).json).toEqual({ salt: SALT, iterations: 300_000 });
    const l = await call('POST', '/account/login', { nick: 'BARTEK_Ż', key: KEY_A });
    expect(l.status).toBe(200);
    expect(l.json).toMatchObject({ nick: 'Bartek_ż', shareWorkouts: true, shareBench: true, mustChange: false });
    expect((await call('GET', '/account/me', undefined, { token: l.json.token })).json.nick).toBe('Bartek_ż');
  });

  it('nicks are unique ignoring case; bad nicks and keys are refused', async () => {
    expect((await join('Ola')).status).toBe(200);
    expect((await join('oLA')).status).toBe(409);
    expect((await join('ab')).status).toBe(400);
    expect((await join('spacja nie')).status).toBe(400);
    expect((await join('x'.repeat(21))).status).toBe(400);
    expect((await join('Okej', { key: 'short' })).status).toBe(400);
    expect((await join('Okej2', { iterations: 1000 })).status).toBe(400);
    // Cyrillic "а" looks like Latin "a": refused, so nobody can impersonate "Ola".
    expect((await join('Olа')).status).toBe(400);
    expect((await join('Łucja_Ś')).status).toBe(200);
  });

  it('salt does not reveal whether a nick exists (stable fake for unknown nicks)', async () => {
    const a = await call('GET', '/account/salt?nick=nikogo');
    const b = await call('GET', '/account/salt?nick=NIKOGO');
    expect(a.status).toBe(200);
    expect(a.json.salt).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(b.json).toEqual(a.json);
    expect((await call('POST', '/account/login', { nick: 'nikogo', key: KEY_A })).status).toBe(401);
  });

  it('parallel wrong guesses cannot get past the limit', async () => {
    await join('Szybki');
    const results = await Promise.all(Array.from({ length: 12 }, () => call('POST', '/account/login', { nick: 'Szybki', key: KEY_B })));
    expect(results.filter((r) => r.status === 401).length).toBeLessThanOrEqual(5);
    expect((await call('POST', '/account/login', { nick: 'Szybki', key: KEY_A })).status).toBe(429);
  });

  it('a correct login does not use up the limit', async () => {
    await join('Stały');
    for (let i = 0; i < 8; i++) expect((await call('POST', '/account/login', { nick: 'Stały', key: KEY_A })).status).toBe(200);
  });

  it('the server stores only a hash: no key, no token in the database', async () => {
    const j = await join('Kasia');
    const m = await env.DB.prepare('SELECT * FROM members').first<Record<string, string>>();
    expect(JSON.stringify(m)).not.toContain(KEY_A);
    const s = await env.DB.prepare('SELECT * FROM sessions').first<Record<string, string>>();
    expect(s!.token_hash).not.toBe(j.json.token);
  });

  it('5 wrong passwords lock the nick for 15 minutes, even for the right one', async () => {
    await join('Tomek');
    for (let i = 0; i < 5; i++) expect((await call('POST', '/account/login', { nick: 'Tomek', key: KEY_B })).status).toBe(401);
    expect((await call('POST', '/account/login', { nick: 'Tomek', key: KEY_A })).status).toBe(429);
    now += 15 * 60_000 + 1;
    expect((await call('POST', '/account/login', { nick: 'Tomek', key: KEY_A })).status).toBe(200);
  });

  it('hammering a locked nick does not extend the lock', async () => {
    await join('Lena');
    for (let i = 0; i < 5; i++) await call('POST', '/account/login', { nick: 'Lena', key: KEY_B }, { ip: `9.0.0.${i}` });
    now += 10 * 60_000;
    for (let i = 0; i < 10; i++) expect((await call('POST', '/account/login', { nick: 'Lena', key: KEY_B }, { ip: '9.9.9.9' })).status).toBe(429);
    now += 5 * 60_000 + 1;
    expect((await call('POST', '/account/login', { nick: 'Lena', key: KEY_A })).status).toBe(200);
  });

  it('without SALT_SECRET an unknown nick gets a plain 404, never a constant key', async () => {
    delete env.SALT_SECRET;
    expect((await call('GET', '/account/salt?nick=nikogo')).status).toBe(404);
  });

  it('an IP that fails on many nicks is limited too', async () => {
    for (let i = 0; i < 20; i++) await call('POST', '/account/login', { nick: `nick${i}x`, key: KEY_B }, { ip: '6.6.6.6' });
    await join('Ania');
    expect((await call('POST', '/account/login', { nick: 'Ania', key: KEY_A }, { ip: '6.6.6.6' })).status).toBe(429);
    expect((await call('POST', '/account/login', { nick: 'Ania', key: KEY_A }, { ip: '7.7.7.7' })).status).toBe(200);
  });

  it('5 joins per IP per hour', async () => {
    for (let i = 0; i < 5; i++) expect((await join(`gracz${i}`, {}, '8.8.8.8')).status).toBe(200);
    expect((await join('gracz5', {}, '8.8.8.8')).status).toBe(429);
  });

  it('a join code is required only when JOIN_CODE is set', async () => {
    env.JOIN_CODE = 'banan';
    expect((await join('Zosia')).status).toBe(403);
    expect((await join('Zosia', { code: 'banan' })).status).toBe(200);
  });

  it('password change keeps this session, ends the others, and the old key stops working', async () => {
    const a = (await join('Marek')).json.token;
    const b = (await call('POST', '/account/login', { nick: 'Marek', key: KEY_A })).json.token;
    expect((await call('POST', '/account/password', { salt: SALT, iterations: 300_000, key: KEY_B }, { token: a })).status).toBe(204);
    expect((await call('GET', '/account/me', undefined, { token: a })).status).toBe(200);
    expect((await call('GET', '/account/me', undefined, { token: b })).status).toBe(401);
    expect((await call('POST', '/account/login', { nick: 'Marek', key: KEY_A })).status).toBe(401);
    expect((await call('POST', '/account/login', { nick: 'Marek', key: KEY_B })).status).toBe(200);
  });

  it('log out ends only this session; leave deletes everything', async () => {
    const t = (await join('Iza')).json.token;
    await call('POST', '/scores', { week: WEEK, month: MONTH, workoutsWeek: 2, workoutsMonth: 5 }, { token: t });
    expect((await call('DELETE', '/account/session', undefined, { token: t })).status).toBe(204);
    expect((await call('GET', '/account/me', undefined, { token: t })).status).toBe(401);
    const t2 = (await call('POST', '/account/login', { nick: 'Iza', key: KEY_A })).json.token;
    expect((await call('DELETE', '/account', undefined, { token: t2 })).status).toBe(204);
    for (const table of ['members', 'sessions', 'scores']) {
      expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n).toBe(0);
    }
  });

  it('bad or missing tokens get 401', async () => {
    expect((await call('GET', '/account/me')).status).toBe(401);
    expect((await call('GET', '/account/me', undefined, { token: '0'.repeat(32) })).status).toBe(401);
    expect((await call('POST', '/scores', { week: WEEK, month: MONTH }, { token: 'not-hex' })).status).toBe(401);
  });

  it('bodies over 4 KB and other origins are refused', async () => {
    expect((await call('POST', '/account/join', undefined, { raw: JSON.stringify({ nick: 'x'.repeat(5000) }) })).status).toBe(413);
    expect((await call('POST', '/account/login', { nick: 'Ola', key: KEY_A }, { origin: 'https://evil.example' })).status).toBe(403);
  });
});

describe('scores and ranking', () => {
  it('workouts per week and month, bench as one all-time table, own nick', async () => {
    const a = (await join('Adam')).json.token;
    const b = (await join('Basia', { shareBench: false })).json.token;
    await join('Cezary'); // nothing sent yet
    await call('POST', '/scores', { week: WEEK, month: MONTH, workoutsWeek: 3, workoutsMonth: 10, benchBest: 300.5 }, { token: a });
    await call('POST', '/scores', { week: WEEK, month: MONTH, workoutsWeek: 4, workoutsMonth: 8, benchBest: 999 }, { token: b });
    const r = await call('GET', `/ranking?week=${WEEK}&month=${MONTH}`, undefined, { token: a });
    expect(r.status).toBe(200);
    expect(r.json.me).toBe('Adam');
    expect(r.json.week.workouts).toEqual([
      { nick: 'Basia', value: 4 },
      { nick: 'Adam', value: 3 },
      { nick: 'Cezary', value: 0 },
    ]);
    expect(r.json.month.workouts[0]).toEqual({ nick: 'Adam', value: 10 });
    expect(r.json.bench).toEqual([{ nick: 'Adam', value: 300.5 }]); // Basia does not share bench
    // Apps on 0.9.20 read week.bench / month.bench: still present, empty.
    expect(r.json.week.bench).toEqual([]);
    expect(r.json.month.bench).toEqual([]);
  });

  it('the bench record does not depend on the period and one row per member is kept', async () => {
    const a = (await join('Adam')).json.token;
    await call('POST', '/scores', { week: '2026-W47', month: MONTH, workoutsWeek: 1, workoutsMonth: 1, benchBest: 250 }, { token: a });
    await call('POST', '/scores', { week: WEEK, month: MONTH, workoutsWeek: 1, workoutsMonth: 1, benchBest: 260 }, { token: a });
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM records').first<{ n: number }>())!.n).toBe(1);
    const r = await call('GET', '/ranking?week=2026-W01&month=2026-01', undefined, { token: a });
    expect(r.json.bench).toEqual([{ nick: 'Adam', value: 260 }]);
    expect(r.json.week.workouts).toEqual([{ nick: 'Adam', value: 0 }]);
  });

  it('the current truth replaces the stored values; a missing value removes the row (an edit can lower it)', async () => {
    const a = (await join('Adam')).json.token;
    await call('POST', '/scores', { week: WEEK, month: MONTH, workoutsWeek: 3, workoutsMonth: 3, benchBest: 300 }, { token: a });
    await call('POST', '/scores', { week: WEEK, month: MONTH, workoutsWeek: 2, workoutsMonth: 2, benchBest: 280 }, { token: a });
    let r = await call('GET', `/ranking?week=${WEEK}&month=${MONTH}`, undefined, { token: a });
    expect(r.json.week.workouts).toEqual([{ nick: 'Adam', value: 2 }]);
    expect(r.json.bench).toEqual([{ nick: 'Adam', value: 280 }]);
    await call('POST', '/scores', { week: WEEK, month: MONTH, workoutsWeek: 2, workoutsMonth: 2 }, { token: a });
    r = await call('GET', `/ranking?week=${WEEK}&month=${MONTH}`, undefined, { token: a });
    expect(r.json.bench).toEqual([]);
  });

  it('old per-period bench fields from 0.9.20 apps are ignored', async () => {
    const a = (await join('Adam')).json.token;
    await call('POST', '/scores', { week: WEEK, month: MONTH, workoutsWeek: 1, workoutsMonth: 1, benchWeek: 300, benchMonth: 300 }, { token: a });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM scores WHERE metric = 'bench'").first<{ n: number }>())!.n).toBe(0);
  });

  it('turning bench sharing off removes the record at once; leaving removes it too', async () => {
    const a = (await join('Adam')).json.token;
    await call('POST', '/scores', { week: WEEK, month: MONTH, workoutsWeek: 1, workoutsMonth: 1, benchBest: 250 }, { token: a });
    expect((await call('POST', '/account/sharing', { shareWorkouts: true, shareBench: false }, { token: a })).status).toBe(204);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM records').first<{ n: number }>())!.n).toBe(0);
    expect((await call('GET', '/account/me', undefined, { token: a })).json).toMatchObject({ shareWorkouts: true, shareBench: false });
    await call('POST', '/account/sharing', { shareWorkouts: true, shareBench: true }, { token: a });
    await call('POST', '/scores', { week: WEEK, month: MONTH, benchBest: 250 }, { token: a });
    await call('DELETE', '/account', undefined, { token: a });
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM records').first<{ n: number }>())!.n).toBe(0);
  });

  it('refuses bad periods and absurd values', async () => {
    const a = (await join('Adam')).json.token;
    expect((await call('POST', '/scores', { week: '2026-48', month: MONTH }, { token: a })).status).toBe(400);
    await call('POST', '/scores', { week: WEEK, month: MONTH, workoutsWeek: 5000, workoutsMonth: -1, benchBest: 5000 }, { token: a });
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM scores').first<{ n: number }>())!.n).toBe(0);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM records').first<{ n: number }>())!.n).toBe(0);
    expect((await call('GET', '/ranking?week=x&month=y', undefined, { token: a })).status).toBe(400);
  });

  it('period rows older than 3 months are deleted; the bench record stays', async () => {
    const a = (await join('Adam')).json.token;
    await call('POST', '/scores', { week: '2026-W30', month: '2026-07', workoutsWeek: 1, workoutsMonth: 1, benchBest: 200 }, { token: a });
    now += 93 * 24 * 3600_000;
    await call('POST', '/scores', { week: WEEK, month: MONTH, workoutsWeek: 1, workoutsMonth: 1, benchBest: 200 }, { token: a });
    const periods = (await env.DB.prepare('SELECT period FROM scores ORDER BY period').all<{ period: string }>()).results.map((r) => r.period);
    expect(periods).toEqual([MONTH, WEEK]);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM records').first<{ n: number }>())!.n).toBe(1);
  });
});

describe('admin', () => {
  const admin = (path: string, body: object, token = 'admin-secret-0123456789') => call('POST', path, body, { token, origin: null });

  it('needs the admin token', async () => {
    await join('Ewa');
    expect((await admin('/admin/remove', { nick: 'Ewa' }, 'wrong')).status).toBe(401);
    delete env.ADMIN_TOKEN;
    expect((await admin('/admin/remove', { nick: 'Ewa' }, '')).status).toBe(401);
  });

  it('reset sets a temporary password, ends sessions and asks for a change', async () => {
    const t = (await join('Ewa')).json.token;
    for (let i = 0; i < 5; i++) await call('POST', '/account/login', { nick: 'Ewa', key: KEY_B });
    expect((await admin('/admin/reset', { nick: 'ewa', salt: SALT, iterations: 300_000, key: KEY_B })).status).toBe(204);
    expect((await call('GET', '/account/me', undefined, { token: t })).status).toBe(401);
    const l = await call('POST', '/account/login', { nick: 'Ewa', key: KEY_B });
    expect(l.status).toBe(200); // the lock is lifted by the reset
    expect(l.json.mustChange).toBe(true);
    await call('POST', '/account/password', { salt: SALT, iterations: 300_000, key: KEY_A }, { token: l.json.token });
    expect((await call('GET', '/account/me', undefined, { token: l.json.token })).json.mustChange).toBe(false);
  });

  it('remove deletes the member; unknown nick → 404', async () => {
    await join('Ewa');
    expect((await admin('/admin/remove', { nick: 'Ewa' })).status).toBe(204);
    expect((await admin('/admin/remove', { nick: 'Ewa' })).status).toBe(404);
  });
});
