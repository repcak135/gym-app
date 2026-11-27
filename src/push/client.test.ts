import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { getSettings, updateSettings } from '../data/settings';
import { cancelRestPush, disablePush, enablePush, scheduleRestPush } from './client';
import { PUSH_URL } from './config';

const ID = 'c'.repeat(32);
let fetchMock: ReturnType<typeof vi.fn>;

function fakeServiceWorker(value: unknown) {
  Object.defineProperty(navigator, 'serviceWorker', { value, configurable: true });
}

beforeEach(async () => {
  await db.settings.clear();
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe('push client', () => {
  it('has the production server configured', () => {
    expect(PUSH_URL).toMatch(/^https:\/\/.+\.workers\.dev$/);
  });

  it('schedule posts the exact JSON as text/plain with keepalive', () => {
    scheduleRestPush(ID, 1000, 'Koniec przerwy', 'Seria 2 · Przysiad');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${PUSH_URL}/schedule`);
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
    expect(JSON.parse(init.body as string)).toEqual({ id: ID, endsAt: 1000, title: 'Koniec przerwy', body: 'Seria 2 · Przysiad' });
  });

  it('a failing network never throws out of schedule', () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    expect(() => scheduleRestPush(ID, 1, 't', 'b')).not.toThrow();
  });

  it('cancel answered 404 (server forgot the phone) turns the switch off', async () => {
    await updateSettings({ restPush: true, pushId: ID });
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    cancelRestPush(ID);
    await vi.waitFor(async () => expect((await getSettings()).restPush).toBe(false));
    expect((await getSettings()).pushId).toBeUndefined();
  });

  it('enable without push support stores nothing', async () => {
    expect(await enablePush()).toBe('unsupported');
    expect((await getSettings()).restPush).toBeUndefined();
  });

  it('enable with permission denied stores nothing and calls no server', async () => {
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { requestPermission: async () => 'denied' });
    fakeServiceWorker({ ready: new Promise(() => {}) });
    expect(await enablePush()).toBe('denied');
    expect((await getSettings()).restPush).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enable subscribes, registers and stores the id', async () => {
    const sub = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } }) };
    const subscribe = vi.fn(async () => sub);
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { requestPermission: async () => 'granted' });
    fakeServiceWorker({ ready: Promise.resolve({ pushManager: { subscribe } }) });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: ID }), { status: 200 }));
    expect(await enablePush()).toBe('ok');
    expect((subscribe.mock.calls[0] as unknown[])[0]).toMatchObject({ userVisibleOnly: true });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ subscription: sub.toJSON() });
    expect(await getSettings()).toMatchObject({ restPush: true, pushId: ID });
  });

  it('enable reports a server error and stays off', async () => {
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { requestPermission: async () => 'granted' });
    fakeServiceWorker({ ready: Promise.resolve({ pushManager: { subscribe: async () => ({ toJSON: () => ({}) }) } }) });
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    expect(await enablePush()).toBe('error');
    expect((await getSettings()).restPush).toBeUndefined();
  });

  it('disable forgets the phone on the server and turns the switch off', async () => {
    await updateSettings({ restPush: true, pushId: ID });
    const unsubscribe = vi.fn(async () => true);
    fakeServiceWorker({ ready: Promise.resolve({ pushManager: { getSubscription: async () => ({ unsubscribe }) } }) });
    await disablePush(ID);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${PUSH_URL}/subscribe`);
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body as string)).toEqual({ id: ID });
    expect(unsubscribe).toHaveBeenCalled();
    expect(await getSettings()).toMatchObject({ restPush: false });
    expect((await getSettings()).pushId).toBeUndefined();
  });
});
