// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ErrorLogCore, MAX_AGE_MS, MAX_REPORTS, parseReport, type ErrorReport, type ListStorage } from './errors';
import { handle, type Env } from './index';

class MemList implements ListStorage {
  map = new Map<string, unknown>();
  async get<T>(k: string) {
    return this.map.get(k) as T | undefined;
  }
  async put(k: string, v: unknown) {
    this.map.set(k, structuredClone(v));
  }
  async delete(keys: string | string[]) {
    let n = 0;
    for (const k of Array.isArray(keys) ? keys : [keys]) if (this.map.delete(k)) n++;
    return n;
  }
  async list<T>(o: { prefix?: string; reverse?: boolean; limit?: number } = {}) {
    let keys = [...this.map.keys()].filter((k) => k.startsWith(o.prefix ?? '')).sort();
    if (o.reverse) keys.reverse();
    if (o.limit) keys = keys.slice(0, o.limit);
    return new Map(keys.map((k) => [k, this.map.get(k) as T]));
  }
}

const NOW = 1_800_000_000_000;
const report = (receivedAt: number, message = 'boom'): ErrorReport => ({ version: '0.9.19', message, stack: '', path: '#/', device: 'iPhone, iOS 26', at: receivedAt, receivedAt });

describe('parseReport', () => {
  it('caps the message at 500 chars and the stack at 2 KB, strips queries, drops extra fields', () => {
    const r = parseReport(
      { version: '0.9.19', message: 'x'.repeat(900), stack: 'at f (https://a.b/x.js?v=1:2:3)\n' + 'y'.repeat(5000), path: '#/plan?d=SECRET', device: 'Android 15, Chrome 142', at: 5, weights: [100] },
      NOW,
    )!;
    expect(r.message).toHaveLength(500);
    expect(r.stack.length).toBeLessThanOrEqual(2048);
    expect(r.stack.startsWith('at f (https://a.b/x.js:2:3)')).toBe(true);
    expect(r.path).toBe('#/plan');
    expect(r).not.toHaveProperty('weights');
    expect(r.receivedAt).toBe(NOW);
  });

  it('removes terminal escape and other control characters, keeps stack newlines', () => {
    const r = parseReport({ message: 'a\u001b[2Jb\u009bc\u0007', stack: 'l1\nl2\r\u001b]0;x', device: '\u001b[31mred' }, NOW)!;
    expect(r.message).toBe('a[2Jbc');
    expect(r.stack).toBe('l1\nl2]0;x');
    expect(r.device).toBe('[31mred');
  });

  it('refuses a report without a message', () => {
    expect(parseReport({ version: '1' }, NOW)).toBeNull();
    expect(parseReport(null, NOW)).toBeNull();
  });
});

describe('ErrorLogCore', () => {
  it('keeps only the newest 500 reports, newest first', async () => {
    const s = new MemList();
    const log = new ErrorLogCore(s, () => NOW);
    for (let i = 0; i < MAX_REPORTS + 5; i++) await log.add(report(NOW - 1000 + i, `m${i}`));
    expect(s.map.size).toBe(MAX_REPORTS);
    const list = await log.list(3);
    expect(list.map((r) => r.message)).toEqual([`m${MAX_REPORTS + 4}`, `m${MAX_REPORTS + 3}`, `m${MAX_REPORTS + 2}`]);
  });

  it('drops reports older than 30 days', async () => {
    const s = new MemList();
    let now = NOW;
    const log = new ErrorLogCore(s, () => now);
    await log.add(report(NOW, 'old'));
    now = NOW + MAX_AGE_MS + 1;
    await log.add(report(now, 'new'));
    expect((await log.list()).map((r) => r.message)).toEqual(['new']);
  });

  it('allows 10 reports per IP per minute', () => {
    let now = NOW;
    const log = new ErrorLogCore(new MemList(), () => now);
    for (let i = 0; i < 10; i++) expect(log.allow('1.2.3.4')).toBe(true);
    expect(log.allow('1.2.3.4')).toBe(false);
    expect(log.allow('5.6.7.8')).toBe(true);
    now += 60_001;
    expect(log.allow('1.2.3.4')).toBe(true);
  });
});

describe('/errors routes', () => {
  function env(token?: string) {
    const fetches: { url: string; body?: string }[] = [];
    const stub = {
      fetch: vi.fn(async (url: string, init?: RequestInit) => {
        fetches.push({ url, body: init?.body as string | undefined });
        return url.includes('/list') ? Response.json([report(NOW)]) : new Response(null, { status: 204 });
      }),
    };
    const e = { ERRORS: { idFromName: (n: string) => n, get: () => stub }, DEVICE: {}, ERRORS_TOKEN: token } as unknown as Env;
    return { e, fetches };
  }
  const post = (body: string, origin = 'https://repcak135.github.io') =>
    new Request('https://w.example/errors', { method: 'POST', headers: { Origin: origin, 'CF-Connecting-IP': '9.9.9.9' }, body });

  it('stores a cleaned report with the sender IP only for rate limiting', async () => {
    const { e, fetches } = env();
    const res = await handle(post(JSON.stringify({ version: '0.9.19', message: 'boom', path: '#/trening' })), e, NOW);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://repcak135.github.io');
    const sent = JSON.parse(fetches[0].body!);
    expect(sent.ip).toBe('9.9.9.9');
    expect(sent.report).toMatchObject({ message: 'boom', path: '#/trening', receivedAt: NOW });
  });

  it('refuses other origins and bodies over 4 KB', async () => {
    const { e, fetches } = env();
    expect((await handle(post('{"message":"x"}', 'https://evil.example'), e, NOW)).status).toBe(403);
    expect((await handle(post(JSON.stringify({ message: 'x'.repeat(5000) })), e, NOW)).status).toBe(413);
    expect(fetches).toEqual([]);
  });

  it('GET /errors needs the secret token', async () => {
    const { e } = env('s3cret-token');
    const get = (auth?: string) => new Request('https://w.example/errors?limit=5', { headers: auth ? { Authorization: auth } : {} });
    expect((await handle(get(), e, NOW)).status).toBe(401);
    expect((await handle(get('Bearer wrong-token!'), e, NOW)).status).toBe(401);
    const ok = await handle(get('Bearer s3cret-token'), e, NOW);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual([report(NOW)]);
  });

  it('GET /errors is closed when no token is configured', async () => {
    const { e } = env(undefined);
    expect((await handle(new Request('https://w.example/errors', { headers: { Authorization: 'Bearer ' } }), e, NOW)).status).toBe(401);
  });
});
