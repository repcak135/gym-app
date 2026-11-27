// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handle, type Env } from './index';
import { isAllowedEndpoint } from './validate';

const NOW = 1_800_000_000_000;
const ID = 'a'.repeat(32);
const ORIGIN = 'https://repcak135.github.io';
const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BPUB', auth: 'AUTH' } };

let calls: { name: string; op: string; body: Record<string, unknown> }[];
let env: Env;

beforeEach(() => {
  calls = [];
  const ns = {
    idFromName: (name: string) => name,
    get: (name: string) => ({
      fetch: vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ name, op: new URL(url).pathname, body: JSON.parse(init.body as string) });
        return new Response(null, { status: 204 });
      }),
    }),
  };
  env = { DEVICE: ns as unknown as DurableObjectNamespace, VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', VAPID_SUBJECT: '' };
});

const req = (method: string, path: string, body?: unknown, origin = ORIGIN) =>
  new Request(`https://w.example${path}`, {
    method,
    headers: { Origin: origin, 'Content-Type': 'text/plain' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('router', () => {
  it('subscribe returns a new 32-hex id and stores the subscription in that device', async () => {
    const res = await handle(req('POST', '/subscribe', { subscription: SUB }), env, NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const { id } = (await res.json()) as { id: string };
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(calls).toEqual([{ name: id, op: '/subscribe', body: { sub: SUB } }]);
  });

  it('subscribe with a known id refreshes that device', async () => {
    const res = await handle(req('POST', '/subscribe', { id: ID, subscription: SUB }), env, NOW);
    expect(await res.json()).toEqual({ id: ID });
  });

  it('schedule forwards a cleaned pending push', async () => {
    const res = await handle(req('POST', '/schedule', { id: ID, endsAt: NOW + 60_000, title: 'Koniec przerwy', body: 'Seria 2 · Przysiad', extra: 'x' }), env, NOW);
    expect(res.status).toBe(204);
    expect(calls[0]).toEqual({ name: ID, op: '/schedule', body: { pending: { endsAt: NOW + 60_000, title: 'Koniec przerwy', body: 'Seria 2 · Przysiad' } } });
  });

  it('cancel and DELETE /subscribe reach the device', async () => {
    await handle(req('POST', '/cancel', { id: ID }), env, NOW);
    await handle(req('DELETE', '/subscribe', { id: ID }), env, NOW);
    expect(calls.map((c) => c.op)).toEqual(['/cancel', '/forget']);
  });

  it('answers the CORS preflight for the app origin', async () => {
    const res = await handle(req('OPTIONS', '/subscribe'), env, NOW);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
  });

  it('refuses other origins', async () => {
    expect((await handle(req('POST', '/schedule', { id: ID, endsAt: NOW + 1000 }, 'https://evil.example'), env, NOW)).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('refuses an endpoint on another host', async () => {
    const res = await handle(req('POST', '/subscribe', { subscription: { ...SUB, endpoint: 'https://evil.example/push' } }), env, NOW);
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('refuses endsAt more than 30 minutes ahead or in the past', async () => {
    expect((await handle(req('POST', '/schedule', { id: ID, endsAt: NOW + 31 * 60_000 }), env, NOW)).status).toBe(400);
    expect((await handle(req('POST', '/schedule', { id: ID, endsAt: NOW - 60_000 }), env, NOW)).status).toBe(400);
  });

  it('refuses a body over 4 KB', async () => {
    expect((await handle(req('POST', '/schedule', JSON.stringify({ id: ID, pad: 'x'.repeat(5000) })), env, NOW)).status).toBe(413);
  });

  it('refuses a bad id, bad JSON and unknown routes', async () => {
    expect((await handle(req('POST', '/schedule', { id: 'nope', endsAt: NOW + 1000 }), env, NOW)).status).toBe(400);
    expect((await handle(req('POST', '/schedule', '{oops'), env, NOW)).status).toBe(400);
    expect((await handle(req('GET', '/anything'), env, NOW)).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it('passes the device 404 (unknown id) back to the app', async () => {
    env.DEVICE = {
      idFromName: (n: string) => n,
      get: () => ({ fetch: async () => new Response(null, { status: 404 }) }),
    } as unknown as DurableObjectNamespace;
    expect((await handle(req('POST', '/schedule', { id: ID, endsAt: NOW + 1000 }), env, NOW)).status).toBe(404);
  });
});

describe('isAllowedEndpoint', () => {
  it.each([
    ['https://web.push.apple.com/QGx', true],
    ['https://fcm.googleapis.com/fcm/send/x', true],
    ['https://updates.push.services.mozilla.com/wpush/v2/x', true],
    ['https://wns2-par02p.notify.windows.com/w/?token=x', true],
    ['http://fcm.googleapis.com/x', false],
    ['https://fcm.googleapis.com.evil.example/x', false],
    ['https://evilpush.services.mozilla.com.example/x', false],
    ['https://fcm.googleapis.com:8443/x', false],
    ['not a url', false],
  ])('%s → %s', (url, ok) => {
    expect(isAllowedEndpoint(url)).toBe(ok);
  });
});
