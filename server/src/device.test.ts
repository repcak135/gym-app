// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceCore, type StorageLike } from './device';
import { b64u } from './webpush';

class MemStorage implements StorageLike {
  map = new Map<string, unknown>();
  alarm: number | null = null;
  async get<T>(k: string) {
    return this.map.get(k) as T | undefined;
  }
  async put(k: string, v: unknown) {
    this.map.set(k, structuredClone(v));
  }
  async delete(k: string) {
    return this.map.delete(k);
  }
  async deleteAll() {
    this.map.clear();
  }
  async setAlarm(at: number) {
    this.alarm = at;
  }
  async deleteAlarm() {
    this.alarm = null;
  }
}

const NOW = 1_800_000_000_000;
let storage: MemStorage;
let device: DeviceCore;
let fetchMock: ReturnType<typeof vi.fn>;

async function env() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])) as CryptoKeyPair;
  const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const sub = {
    endpoint: 'https://web.push.apple.com/x',
    keys: { p256dh: b64u(await crypto.subtle.exportKey('raw', ua.publicKey)), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) },
  };
  return { env: { VAPID_PUBLIC_KEY: 'PUB', VAPID_PRIVATE_KEY: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)), VAPID_SUBJECT: 'https://e.org/' }, sub };
}

const pending = (endsAt = NOW + 90_000) => ({ endsAt, title: 'Koniec przerwy', body: 'Seria 2 · Przysiad' });

describe('Device', () => {
  let now = NOW;
  beforeEach(async () => {
    now = NOW;
    storage = new MemStorage();
    const e = await env();
    device = new DeviceCore(storage, e.env, () => now);
    await device.handle('/subscribe', { sub: e.sub });
    fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('schedule stores the pending push and sets the alarm at endsAt', async () => {
    expect((await device.handle('/schedule', { pending: pending() })).status).toBe(204);
    expect(storage.map.get('pending')).toEqual(pending());
    expect(storage.alarm).toBe(NOW + 90_000);
  });

  it('a second schedule replaces the first', async () => {
    await device.handle('/schedule', { pending: pending() });
    await device.handle('/schedule', { pending: pending(NOW + 120_000) });
    expect((storage.map.get('pending') as { endsAt: number }).endsAt).toBe(NOW + 120_000);
    expect(storage.alarm).toBe(NOW + 120_000);
  });

  it('cancel deletes the pending push and the alarm', async () => {
    await device.handle('/schedule', { pending: pending() });
    expect((await device.handle('/cancel', {})).status).toBe(204);
    expect(storage.map.has('pending')).toBe(false);
    expect(storage.alarm).toBeNull();
  });

  it('the alarm sends once and deletes the pending entry', async () => {
    await device.handle('/schedule', { pending: pending() });
    now = NOW + 90_100;
    await device.alarm();
    await device.alarm();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://web.push.apple.com/x');
    expect(storage.map.has('pending')).toBe(false);
  });

  it('410 from the push service forgets the subscription', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 410 }));
    await device.handle('/schedule', { pending: pending() });
    await device.alarm();
    expect(storage.map.size).toBe(0);
    expect((await device.handle('/schedule', { pending: pending() })).status).toBe(404);
  });

  it('a push more than 2 minutes late is dropped', async () => {
    await device.handle('/schedule', { pending: pending() });
    now = NOW + 90_000 + 121_000;
    await device.alarm();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a network error in the alarm is swallowed (no retry storm)', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    await device.handle('/schedule', { pending: pending() });
    await expect(device.alarm()).resolves.toBeUndefined();
  });

  it('the 61st schedule within an hour is refused', async () => {
    for (let i = 0; i < 60; i++) expect((await device.handle('/schedule', { pending: pending() })).status).toBe(204);
    expect((await device.handle('/schedule', { pending: pending() })).status).toBe(429);
    now = NOW + 3600_001;
    expect((await device.handle('/schedule', { pending: pending(now + 1000) })).status).toBe(204);
  });

  it('forget deletes everything', async () => {
    await device.handle('/schedule', { pending: pending() });
    await device.handle('/forget', {});
    expect(storage.map.size).toBe(0);
    expect(storage.alarm).toBeNull();
  });
});
