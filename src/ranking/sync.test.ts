import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { getSettings, updateSettings } from '../data/settings';
import { syncScores } from './RankingSync';
import { deriveKey, forgetLastSent } from './account';
import { createBackup, parseBackup, restoreBackup } from '../data/backup';

const TOKEN = 'f'.repeat(32);
const NOW = new Date(2026, 10, 27, 12).getTime();
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await Promise.all([db.settings.clear(), db.workouts.clear(), db.sets.clear(), db.body.clear()]);
  forgetLastSent();
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function joined() {
  await updateSettings({ rankToken: TOKEN, rankNick: 'Ola', rankSex: 'f', rankShareWorkouts: true, rankShareBench: true });
}

describe('syncScores', () => {
  it('not in the ranking: nothing is sent', async () => {
    expect(await syncScores(NOW)).toBe('off');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the current truth with the token, then not again until something changes', async () => {
    await joined();
    await db.workouts.add({ id: 'w1', name: 'A', startedAt: NOW - 3600_000, endedAt: NOW, source: 'app' });
    expect(await syncScores(NOW)).toBe('sent');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/scores$/);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body as string)).toEqual({ week: '2026-W48', month: '2026-11', workoutsWeek: 1, workoutsMonth: 1 });
    expect(await syncScores(NOW)).toBe('same');
    await db.workouts.delete('w1'); // a deleted workout lowers the score
    expect(await syncScores(NOW)).toBe('sent');
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string).workoutsWeek).toBe(0);
  });

  it('never sends body weight, sex or kilograms', async () => {
    await joined();
    await db.body.add({ id: 'b', date: '2026-11-20', weightKg: 61, measurements: {} });
    await db.workouts.add({ id: 'w1', name: 'A', startedAt: NOW - 3600_000, endedAt: NOW, source: 'app' });
    await db.sets.add({ id: 's', workoutId: 'w1', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', exerciseOrder: 0, setOrder: 0, weight: 57.5, reps: 3, warmup: false, completedAt: 1 } as never);
    await syncScores(NOW);
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
    expect(Object.keys(JSON.parse(body)).sort()).toEqual(['benchMonth', 'benchWeek', 'month', 'week', 'workoutsMonth', 'workoutsWeek']);
    expect(body).not.toMatch(/57\.5|61|"f"/);
  });

  it('offline: fails now, sends on the next try', async () => {
    await joined();
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    expect(await syncScores(NOW)).toBe('failed');
    expect(await syncScores(NOW)).toBe('sent');
  });

  it('401 (session ended elsewhere) signs this phone out of the ranking, keeping sex', async () => {
    await joined();
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    expect(await syncScores(NOW)).toBe('failed');
    const s = await getSettings();
    expect(s.rankToken).toBeUndefined();
    expect(s.rankSex).toBe('f');
  });
});

describe('account data', () => {
  it('the ranking account is never in a backup and survives a restore', async () => {
    await joined();
    const file = await createBackup(5);
    const text = JSON.stringify(file);
    expect(text).not.toContain(TOKEN);
    expect(file.data.settings).not.toHaveProperty('rankNick');
    await updateSettings({ rankToken: undefined });
    await joined();
    await restoreBackup(parseBackup(text));
    expect(await getSettings()).toMatchObject({ rankToken: TOKEN, rankNick: 'Ola', rankSex: 'f' });
  });

  it('password key: PBKDF2-SHA-256, 32 bytes base64url, same as the admin script', async () => {
    const k = await deriveKey('hasło-123', 'AAAAAAAAAAAAAAAAAAAAAA', 1000);
    expect(k).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Value printed by server/admin-lib.mjs deriveKey with the same input (admin reset must match the app).
    expect(k).toBe('Q9mKMInEp8cDHtLIFeojUGL1vra5XUYXFn9KPokEPJQ');
    expect(await deriveKey('hasło-123', 'AAAAAAAAAAAAAAAAAAAAAA', 1000)).toBe(k);
    expect(await deriveKey('hasło-124', 'AAAAAAAAAAAAAAAAAAAAAA', 1000)).not.toBe(k);
  });
});
