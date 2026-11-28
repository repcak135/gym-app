// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { nodeD1 } from './d1-node';
import { handle, type Env } from './index';
import { DOWNLOADS_PER_MONTH, MAX_UPLOAD, UPLOADS_PER_DAY } from './cloud';

const ORIGIN = 'https://repcak135.github.io';
const NOW = 1_800_000_000_000;
const SALT = 'AAAAAAAAAAAAAAAAAAAAAA';
const KEY = 'a'.repeat(43);
const ADMIN = 'admin-secret-0123456789';
const PW_WRAPPED = JSON.stringify({ v: 1, kind: 'pw', salt: SALT, iterations: 300000, iv: 'BBBBBBBBBBBBBBBB', ct: 'C'.repeat(64) });
const ADMIN_WRAPPED = JSON.stringify({ v: 1, kind: 'admin', kid: 'k20261128', epk: 'E'.repeat(87), iv: 'BBBBBBBBBBBBBBBB', ct: 'D'.repeat(64) });

class FakeR2 {
  objects = new Map<string, Uint8Array>();
  puts = 0;
  gets = 0;
  async put(key: string, data: Uint8Array) {
    this.puts++;
    this.objects.set(key, new Uint8Array(data));
  }
  async get(key: string) {
    this.gets++;
    const d = this.objects.get(key);
    return d ? { body: d } : null;
  }
  async delete(keys: string | string[]) {
    for (const k of Array.isArray(keys) ? keys : [keys]) this.objects.delete(k);
  }
}

let env: Env;
let r2: FakeR2;
let now: number;

beforeEach(() => {
  r2 = new FakeR2();
  env = { DB: nodeD1(new URL('../migrations/', import.meta.url)), BACKUPS: r2, ADMIN_TOKEN: ADMIN, SALT_SECRET: 's' } as unknown as Env;
  now = NOW;
});

const KID = 'kidkidkid12';

async function call(method: string, path: string, opts: { body?: BodyInit; json?: unknown; token?: string; origin?: string | null; kid?: string } = {}) {
  const headers: Record<string, string> = {};
  if (method === 'PUT') headers['X-Key-Id'] = opts.kid ?? KID;
  if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN;
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const body = opts.json !== undefined ? JSON.stringify(opts.json) : opts.body;
  const res = await handle(new Request(`https://w.example${path}`, { method, headers, body }), env, now);
  return res;
}

async function join(nick: string): Promise<string> {
  const r = await call('POST', '/account/join', { json: { nick, salt: SALT, iterations: 300000, key: KEY, shareWorkouts: true, shareBench: false } });
  return ((await r.json()) as { token: string }).token;
}

const blob = (n: number, fill = 7) => {
  const b = new Uint8Array(n).fill(fill);
  b.set([0x42, 0x47, 0x42, 0x31], 0);
  return b;
};

async function withKeys(nick = 'Ola') {
  const t = await join(nick);
  expect((await call('POST', '/backup/keys', { token: t, json: { pwWrapped: PW_WRAPPED, adminWrapped: ADMIN_WRAPPED, keyId: KID } })).status).toBe(204);
  return t;
}

const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;

describe('keys', () => {
  it('stores both wrapped keys; the phone gets back only the password one', async () => {
    const t = await withKeys();
    const r = await call('GET', '/backup/keys', { token: t });
    expect(await r.json()).toEqual({ pwWrapped: PW_WRAPPED, keyId: KID, lastBackupAt: null });
  });

  it('a second set of keys is refused (a second phone must adopt the first key)', async () => {
    const t = await withKeys();
    expect((await call('POST', '/backup/keys', { token: t, json: { pwWrapped: PW_WRAPPED, adminWrapped: ADMIN_WRAPPED, keyId: KID } })).status).toBe(409);
  });

  it('malformed wrapped keys are refused; no keys → 404; uploads need keys first', async () => {
    const t = await join('Ola');
    expect((await call('POST', '/backup/keys', { token: t, json: { pwWrapped: '{"v":2}', adminWrapped: ADMIN_WRAPPED } })).status).toBe(400);
    expect((await call('GET', '/backup/keys', { token: t })).status).toBe(404);
    expect((await call('PUT', '/backup', { token: t, body: blob(100) })).status).toBe(409);
  });

  it('everything needs a session and the app origin', async () => {
    expect((await call('GET', '/backup/list')).status).toBe(401);
    const t = await withKeys();
    expect((await call('PUT', '/backup', { token: t, body: blob(100), origin: 'https://evil.example' })).status).toBe(403);
  });
});

describe('uploads and downloads', () => {
  it('an upload made with another backup key (stale phone) is refused', async () => {
    const t = await withKeys();
    const r = await call('PUT', '/backup', { token: t, body: blob(100), kid: 'otherkey000' });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: 'keys' });
    expect(r2.puts).toBe(0);
  });

  it('parallel uploads cannot leave more than 3 objects or 30 MB', async () => {
    const t = await withKeys();
    const results = await Promise.all(Array.from({ length: 6 }, () => call('PUT', '/backup', { token: t, body: blob(9 * 1024 * 1024) })));
    expect(results.filter((r) => r.status === 200).length).toBeGreaterThan(0);
    expect(await count('backups')).toBeLessThanOrEqual(3);
    expect(r2.objects.size).toBeLessThanOrEqual(3);
    const total = (await env.DB.prepare('SELECT SUM(size) AS s FROM backups').first<{ s: number }>())!.s;
    expect(total).toBeLessThanOrEqual(30 * 1024 * 1024);
  });

  it('upload, list, download the newest; only 3 newest kept (R2 objects deleted too)', async () => {
    const t = await withKeys();
    for (let i = 0; i < 5; i++) {
      now += 60_000;
      expect((await call('PUT', '/backup', { token: t, body: blob(100, i) })).status).toBe(200);
    }
    expect(r2.objects.size).toBe(3);
    expect(await count('backups')).toBe(3);
    const list = (await (await call('GET', '/backup/list', { token: t })).json()) as { at: number }[];
    expect(list.map((x) => x.at)).toEqual([NOW + 300_000, NOW + 240_000, NOW + 180_000]);
    const latest = await call('GET', '/backup/latest', { token: t });
    expect(latest.headers.get('X-Backup-At')).toBe(String(NOW + 300_000));
    expect(new Uint8Array(await latest.arrayBuffer())[10]).toBe(4);
  });

  it('refuses a body that is not an encrypted backup, and anything over 10 MB', async () => {
    const t = await withKeys();
    expect((await call('PUT', '/backup', { token: t, body: new TextEncoder().encode('{"plain":"json"}') })).status).toBe(400);
    expect((await call('PUT', '/backup', { token: t, body: blob(MAX_UPLOAD + 1) })).status).toBe(413);
    expect(r2.puts).toBe(0);
  });

  it('at most 20 uploads per member per day', async () => {
    const t = await withKeys();
    for (let i = 0; i < UPLOADS_PER_DAY; i++) expect((await call('PUT', '/backup', { token: t, body: blob(50) })).status).toBe(200);
    const r = await call('PUT', '/backup', { token: t, body: blob(50) });
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'daily' });
    now += 24 * 3600_000;
    expect((await call('PUT', '/backup', { token: t, body: blob(50) })).status).toBe(200);
  });

  it('global monthly upload cap', async () => {
    const t = await withKeys();
    const m = new Date(now).toISOString().slice(0, 7);
    await env.DB.prepare('INSERT INTO counters (key, n, at) VALUES (?, ?, ?)').bind(`up:all:${m}`, 20_000, now).run();
    const r = await call('PUT', '/backup', { token: t, body: blob(50) });
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'monthly' });
  });

  it('global 5 GB storage cap', async () => {
    const t = await withKeys();
    await env.DB.prepare('INSERT INTO backups (object_key, member_id, created_at, size) VALUES (?, 1, 1, ?)').bind('x', 5 * 1024 ** 3 - 10).run();
    const r = await call('PUT', '/backup', { token: t, body: blob(50) });
    expect(r.status).toBe(507);
    expect(r2.puts).toBe(0);
  });

  it('per-member 30 MB cap over the kept objects', async () => {
    const t = await withKeys();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO backups (object_key, member_id, created_at, size) VALUES (?, 1, 1, ?)').bind('a', 10 * 1024 * 1024),
      env.DB.prepare('INSERT INTO backups (object_key, member_id, created_at, size) VALUES (?, 1, 2, ?)').bind('b', 10 * 1024 * 1024),
    ]);
    // 10 + 10 + new 10 MB still fits; with two 15 MB objects kept, nothing more does.
    expect((await call('PUT', '/backup', { token: t, body: blob(10 * 1024 * 1024) })).status).toBe(200);
    await env.DB.prepare('UPDATE backups SET size = ? WHERE member_id = 1').bind(15 * 1024 * 1024).run();
    const r = await call('PUT', '/backup', { token: t, body: blob(1000) });
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ error: 'member' });
  });

  it('at most 2000 downloads per member per month', async () => {
    const t = await withKeys();
    await call('PUT', '/backup', { token: t, body: blob(50) });
    const m = new Date(now).toISOString().slice(0, 7);
    await env.DB.prepare('INSERT INTO counters (key, n, at) VALUES (?, ?, ?)').bind(`down:1:${m}`, DOWNLOADS_PER_MONTH, now).run();
    expect((await call('GET', '/backup/latest', { token: t })).status).toBe(429);
    expect(r2.gets).toBe(0);
  });

  it('switching cloud backup off, leaving the ranking and admin remove delete objects and keys', async () => {
    let t = await withKeys('Ola');
    await call('PUT', '/backup', { token: t, body: blob(50) });
    expect((await call('DELETE', '/backup', { token: t })).status).toBe(204);
    expect(r2.objects.size + (await count('backups')) + (await count('backup_keys'))).toBe(0);

    t = await withKeys('Ewa');
    await call('PUT', '/backup', { token: t, body: blob(50) });
    await call('DELETE', '/account', { token: t });
    expect(r2.objects.size + (await count('backups')) + (await count('backup_keys'))).toBe(0);

    t = await withKeys('Iza');
    await call('PUT', '/backup', { token: t, body: blob(50) });
    await call('POST', '/admin/remove', { token: ADMIN, json: { nick: 'Iza' }, origin: null });
    expect(r2.objects.size + (await count('backups')) + (await count('backup_keys'))).toBe(0);
  });
});

describe('password change with cloud keys', () => {
  const change = (t: string, extra: object = {}) => call('POST', '/account/password', { token: t, json: { salt: SALT, iterations: 300000, key: 'b'.repeat(43), ...extra } });

  it('an old app (no pwWrapped) gets 409 and nothing changes', async () => {
    const t = await withKeys();
    const r = await change(t);
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: 'update' });
    expect((await call('POST', '/account/login', { json: { nick: 'Ola', key: KEY } })).status).toBe(200);
  });

  it('with pwWrapped: login hash and wrapped key change together', async () => {
    const t = await withKeys();
    const newWrapped = PW_WRAPPED.replace('C'.repeat(64), 'F'.repeat(64));
    expect((await change(t, { pwWrapped: newWrapped })).status).toBe(204);
    expect(await (await call('GET', '/backup/keys', { token: t })).json()).toMatchObject({ pwWrapped: newWrapped });
    expect((await call('POST', '/account/login', { json: { nick: 'Ola', key: 'b'.repeat(43) } })).status).toBe(200);
  });

  it('members without cloud keys change the password as before', async () => {
    const t = await join('Bez');
    expect((await change(t)).status).toBe(204);
  });
});

describe('admin', () => {
  const admin = (method: string, path: string, json?: unknown) => call(method, path, { token: ADMIN, json, origin: null });

  it('admin-reset refuses members with cloud keys (admin-recover is needed)', async () => {
    await withKeys();
    const r = await admin('POST', '/admin/reset', { nick: 'Ola', salt: SALT, iterations: 300000, key: 'b'.repeat(43) });
    expect(r.status).toBe(409);
  });

  it('recover: read the admin-wrapped key, then set a temporary password and the re-wrapped key at once', async () => {
    const t = await withKeys();
    now += 1000;
    await call('PUT', '/backup', { token: t, body: blob(50) });
    const info = await (await admin('GET', '/admin/backup-keys?nick=ola')).json();
    expect(info).toEqual({ nick: 'Ola', adminWrapped: ADMIN_WRAPPED, lastBackupAt: NOW + 1000, backups: 1 });
    const temp = PW_WRAPPED.replace('C'.repeat(64), 'T'.repeat(64));
    expect((await admin('POST', '/admin/backup-keys', { nick: 'Ola', salt: SALT, iterations: 300000, key: 'c'.repeat(43), pwWrapped: temp })).status).toBe(204);
    expect((await call('GET', '/account/me', { token: t })).status).toBe(401); // sessions ended
    const l = await call('POST', '/account/login', { json: { nick: 'Ola', key: 'c'.repeat(43) } });
    const lj = (await l.json()) as { token: string; mustChange: boolean };
    expect(lj.mustChange).toBe(true);
    expect(await (await call('GET', '/backup/keys', { token: lj.token })).json()).toMatchObject({ pwWrapped: temp });
  });

  it('admin routes need the admin token; unknown nick → 404', async () => {
    expect((await call('GET', '/admin/snapshot', { token: 'nope', origin: null })).status).toBe(401);
    expect((await admin('GET', '/admin/backup-keys?nick=nikt')).status).toBe(404);
  });

  it('snapshot lists every table; objects can be fetched only by a known key', async () => {
    const t = await withKeys();
    await call('PUT', '/backup', { token: t, body: blob(50) });
    const s = (await (await admin('GET', '/admin/snapshot')).json()) as { tables: Record<string, unknown[]> };
    expect(Object.keys(s.tables).sort()).toEqual(['backup_keys', 'backups', 'exercise_stats', 'members', 'records', 'scores']);
    const key = (s.tables.backups[0] as { object_key: string }).object_key;
    expect((await admin('GET', `/admin/backup-object?key=${encodeURIComponent(key)}`)).status).toBe(200);
    expect((await admin('GET', '/admin/backup-object?key=backups/../secret')).status).toBe(404);
  });
});

describe('anonymous exercise list', () => {
  it('adds set counts up with no member id, nick, dates or weights', async () => {
    const a = await join('Ola');
    const b = await join('Ewa');
    await call('POST', '/stats/exercises', { token: a, json: { items: [{ id: 'Barbell_Squat', name: 'Przysiad', sets: 10, weight: 100, nick: 'Ola' }] } });
    await call('POST', '/stats/exercises', { token: b, json: { items: [{ id: 'Barbell_Squat', name: 'Przysiad', sets: 5 }, { id: 'og-0122', name: 'Wyciskanie', sets: 3 }] } });
    const rows = (await env.DB.prepare('SELECT * FROM exercise_stats ORDER BY exercise_id').all()).results;
    expect(rows).toEqual([
      { exercise_id: 'Barbell_Squat', name: 'Przysiad', sets: 15 },
      { exercise_id: 'og-0122', name: 'Wyciskanie', sets: 3 },
    ]);
  });

  it('drops bad items and needs a session', async () => {
    const a = await join('Ola');
    await call('POST', '/stats/exercises', { token: a, json: { items: [{ id: 'x y z', name: 'a', sets: 1 }, { id: 'ok', name: '', sets: 1 }, { id: 'ok2', name: 'n', sets: 0 }] } });
    expect(await count('exercise_stats')).toBe(0);
    expect((await call('POST', '/stats/exercises', { json: { items: [] } })).status).toBe(401);
  });
});
