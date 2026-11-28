import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { getSettings, updateSettings } from '../data/settings';
import { backupReminderDue, createBackup } from '../data/backup';
import { changePassword, deriveKey, loginRanking } from '../ranking/account';
import { b64u, decryptBackup, newAdminKeyPair, newBackupKey, unwrapForAdmin, unwrapWithPassword, wrapWithPassword } from './crypto';
import { cloudErrorText, downloadLatest, enableCloud, uploadNow } from './cloud';
import { nextUploadDelay } from './CloudSync';
import { readBaseline, statsDelta } from './stats';
import { ApiError } from '../ranking/api';

const TOKEN = 'a'.repeat(32);
const NEW_TOKEN = 'b'.repeat(32);
const SALT = 'AAAAAAAAAAAAAAAAAAAAAA';
const PASSWORD = 'moje-haslo-1';

type Call = { method: string; path: string; body: unknown; auth?: string };
let calls: Call[];
let server: { pwWrapped?: string; adminWrapped?: string; keyId?: string; objects: Uint8Array[]; key: string; puts: (string | undefined)[] };

function respond(status: number, body?: unknown, headers: Record<string, string> = {}) {
  if (body instanceof Uint8Array) return new Response(body as Uint8Array<ArrayBuffer>, { status, headers });
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

beforeEach(async () => {
  await Promise.all([db.settings.clear(), db.workouts.clear(), db.sets.clear(), db.body.clear(), db.plans.clear()]);
  localStorage.clear();
  calls = [];
  server = { objects: [], puts: [], key: await deriveKey(PASSWORD, SALT, 1000) };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = new URL(url);
      const path = u.pathname;
      const method = init.method ?? 'GET';
      const raw = init.body;
      const body = raw instanceof Uint8Array ? raw : typeof raw === 'string' ? JSON.parse(raw) : undefined;
      calls.push({ method, path, body, auth: (init.headers as Record<string, string>)?.Authorization });
      if (path === '/account/salt') return respond(200, { salt: SALT, iterations: 1000 });
      if (path === '/account/login') return body.key === server.key ? respond(200, { token: NEW_TOKEN, nick: 'Ola', shareWorkouts: true, shareBench: false, mustChange: false }) : respond(401);
      if (path === '/account/session') return respond(204);
      if (path === '/backup/keys' && method === 'GET') return server.pwWrapped ? respond(200, { pwWrapped: server.pwWrapped, lastBackupAt: null }) : respond(404);
      if (path === '/backup/keys') {
        if (server.pwWrapped) return respond(409, { error: 'exists' });
        server.pwWrapped = body.pwWrapped;
        server.adminWrapped = body.adminWrapped;
        server.keyId = body.keyId;
        return respond(204);
      }
      if (path === '/backup' && method === 'PUT') {
        const kid = (init.headers as Record<string, string>)['X-Key-Id'];
        server.puts.push(kid);
        if (server.keyId && kid !== server.keyId) return respond(409, { error: 'keys' });
        server.objects.push(body);
        return respond(200, { at: 1234, size: body.length });
      }
      if (path === '/backup/latest') return respond(200, server.objects.at(-1), { 'X-Backup-At': '1234' });
      if (path === '/stats/exercises') return respond(204);
      if (path === '/account/password') return respond(204);
      return respond(404);
    }),
  );
  await updateSettings({ rankToken: TOKEN, rankNick: 'Ola', rankSex: 'f' });
});
afterEach(() => vi.unstubAllGlobals());

async function seedWorkout() {
  await db.exercises.put({ id: 'Barbell_Squat', name: 'Przysiad', custom: false } as never);
  await db.exercises.put({ id: 'my-own', name: 'Moje tajne ćwiczenie', custom: true } as never);
  await db.workouts.add({ id: 'w1', name: 'A', startedAt: 1, endedAt: 2, source: 'app' });
  await db.sets.bulkAdd([
    { id: 's1', workoutId: 'w1', exerciseId: 'Barbell_Squat', exerciseOrder: 0, setOrder: 0, weight: 140, reps: 5, warmup: false, completedAt: 1 },
    { id: 's2', workoutId: 'w1', exerciseId: 'Barbell_Squat', exerciseOrder: 0, setOrder: 1, weight: 60, reps: 5, warmup: true, completedAt: 1 },
    { id: 's3', workoutId: 'w1', exerciseId: 'my-own', exerciseOrder: 1, setOrder: 0, weight: 10, reps: 5, warmup: false, completedAt: 1 },
  ] as never);
}

describe('enable', () => {
  it('first phone: new key, both locks stored, encrypted backup uploaded, history counted once', async () => {
    await seedWorkout();
    await enableCloud(PASSWORD, true);
    const s = await getSettings();
    expect(s).toMatchObject({ cloudOn: true, cloudShareStats: true, rankToken: NEW_TOKEN, cloudLastAt: 1234 });
    const bk = await unwrapWithPassword(server.pwWrapped!, PASSWORD);
    expect(b64u(bk)).toBe(s.cloudKey);
    expect(JSON.parse(server.adminWrapped!)).toMatchObject({ v: 1, kind: 'admin', kid: 'k20261128' });
    // The upload is ciphertext of the real backup.
    const sent = server.objects[0];
    expect(new TextDecoder().decode(sent)).not.toContain('Przysiad');
    expect(JSON.parse(await decryptBackup(sent as Uint8Array<ArrayBuffer>, bk)).data.workouts).toHaveLength(1);
    // Anonymous list: built-in exercise, working sets only, no nick, no weights, no custom names.
    const stats = calls.find((c) => c.path === '/stats/exercises')!;
    expect(stats.body).toEqual({ items: [{ id: 'Barbell_Squat', name: 'Przysiad', sets: 1 }] });
    expect(JSON.stringify(stats.body)).not.toMatch(/Ola|140|tajne/);
    expect(readBaseline()).toEqual({ Barbell_Squat: 1 });
  });

  it('second phone adopts the existing key and does not resend history', async () => {
    const bk = newBackupKey();
    server.pwWrapped = await wrapWithPassword(bk, PASSWORD);
    await seedWorkout();
    await enableCloud(PASSWORD, true);
    expect((await getSettings()).cloudKey).toBe(b64u(bk));
    expect(calls.filter((c) => c.path === '/backup/keys' && c.method === 'POST')).toHaveLength(0);
    expect(calls.find((c) => c.path === '/stats/exercises')).toBeUndefined();
  });

  it('wrong password: refused before any key is made', async () => {
    await expect(enableCloud('zle-haslo', true)).rejects.toThrow('Złe hasło.');
    expect(calls.some((c) => c.path.startsWith('/backup'))).toBe(false);
    expect((await getSettings()).cloudOn).toBeUndefined();
  });

  it('stats switch off: nothing about exercises is sent', async () => {
    await seedWorkout();
    await enableCloud(PASSWORD, false);
    expect(calls.find((c) => c.path === '/stats/exercises')).toBeUndefined();
  });
});

describe('login, restore, password', () => {
  it('login on a new phone opens the key with the typed password; the newest backup restores', async () => {
    const bk = newBackupKey();
    server.pwWrapped = await wrapWithPassword(bk, PASSWORD);
    await seedWorkout();
    const { encryptBackup } = await import('./crypto');
    server.objects.push(await encryptBackup(JSON.stringify(await createBackup(99)), bk));
    await db.workouts.clear();
    await updateSettings({ rankToken: undefined });
    await loginRanking({ nick: 'Ola', password: PASSWORD, sex: 'f' });
    expect(await getSettings()).toMatchObject({ cloudOn: true, cloudKey: b64u(bk) });
    const { file, at } = await downloadLatest();
    expect(at).toBe(1234);
    expect(file.data.workouts).toHaveLength(1);
  });

  it('password change re-wraps the key in the same request; admin lock stays as it was', async () => {
    const bk = newBackupKey();
    await updateSettings({ cloudKey: b64u(bk), cloudOn: true });
    await changePassword(TOKEN, 'nowe-haslo-22');
    const req = calls.find((c) => c.path === '/account/password')!;
    const body = req.body as { pwWrapped: string };
    expect(b64u(await unwrapWithPassword(body.pwWrapped, 'nowe-haslo-22'))).toBe(b64u(bk));
  });

  it('admin recovery key from .env can open what the app wraps (format check)', async () => {
    const pair = await newAdminKeyPair();
    const { wrapForAdmin } = await import('./crypto');
    const bk = newBackupKey();
    expect(b64u(await unwrapForAdmin(await wrapForAdmin(bk, pair.publicKey, 'k'), pair.privateJwk))).toBe(b64u(bk));
    expect(import.meta.env.VITE_ADMIN_RECOVERY_KEY).toMatch(/^[A-Za-z0-9_-]{87}$/);
  });
});

describe('upload rules', () => {
  it('a stale key (cloud switched on again elsewhere) turns cloud off here with a clear message', async () => {
    await updateSettings({ cloudKey: b64u(newBackupKey()), cloudOn: true });
    server.keyId = 'someotherid';
    await expect(uploadNow()).rejects.toThrow(/innym telefonie/);
    expect((await getSettings()).cloudOn).toBeUndefined();
    expect((await getSettings()).cloudKey).toBeUndefined();
  });

  it('upload needs cloud on', async () => {
    await expect(uploadNow()).rejects.toThrow('wyłączona');
  });

  it('10-minute gap between automatic uploads', () => {
    expect(nextUploadDelay(undefined, 1000)).toBe(0);
    expect(nextUploadDelay(0, 60_000)).toBe(9 * 60_000);
    expect(nextUploadDelay(0, 11 * 60_000)).toBe(0);
  });

  it('caps show clear Polish messages', () => {
    const e = (status: number, code?: string) => Object.assign(new ApiError(status), { code });
    expect(cloudErrorText(e(429, 'daily'))).toMatch(/limit/);
    expect(cloudErrorText(e(507, 'full'))).toMatch(/pełny/);
    expect(cloudErrorText(e(0))).toMatch(/internetem/);
  });

  it('stats deltas: only growth, never negative, custom exercises skipped by the caller', () => {
    expect(statsDelta({ a: 5, b: 2 }, { a: 'A', b: 'B' }, { a: 3, b: 4 })).toEqual([{ id: 'a', name: 'A', sets: 2 }]);
  });

  it('the 14-day file reminder waits while a recent cloud backup exists', () => {
    const now = 100 * 86_400_000;
    expect(backupReminderDue({ cloudOn: true, cloudLastAt: now - 86_400_000 }, true, now)).toBe(false);
    expect(backupReminderDue({ cloudOn: true, cloudLastAt: now - 20 * 86_400_000 }, true, now)).toBe(true);
    expect(backupReminderDue({}, true, now)).toBe(true);
  });
});
