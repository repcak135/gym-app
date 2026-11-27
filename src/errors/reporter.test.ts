import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReport, deviceString, reportError, resetErrorReporting, setErrorReports, stripQuery } from './reporter';
import { PUSH_URL } from '../push/config';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
const T = 1_800_000_000_000;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetErrorReporting();
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('stripping', () => {
  it('coarse device strings', () => {
    expect(deviceString(IPHONE)).toBe('iPhone, iOS 26');
    expect(deviceString(ANDROID)).toBe('Android 15, Chrome 142');
    expect(deviceString('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0 Safari/537.36')).toBe('Windows, Chrome 142');
  });

  it('removes queries from URLs but keeps line:col', () => {
    expect(stripQuery('at x (https://a.io/gym-app/assets/i.js?v=3:10:5)')).toBe('at x (https://a.io/gym-app/assets/i.js:10:5)');
    expect(stripQuery('bad link https://a.io/#/plan?d=N4Ig plan')).toBe('bad link https://a.io/#/plan plan');
  });

  it('report: path without query, 6 stack lines, capped message, no other data', () => {
    const e = new Error('x'.repeat(800));
    e.stack = Array.from({ length: 10 }, (_, i) => `line${i} (https://a.io/i.js?q=1:1:${i})`).join('\n');
    const r = buildReport(e, T, '#/plan?d=SECRETPLAN', IPHONE);
    expect(r.path).toBe('#/plan');
    expect(r.message).toHaveLength(500);
    expect(r.stack.split('\n')).toHaveLength(6);
    expect(r.stack).not.toContain('q=1');
    expect(Object.keys(r).sort()).toEqual(['at', 'device', 'message', 'path', 'stack', 'version']);
    expect(r.at).toBe(T);
  });

  it('a rejected object never has its contents sent', () => {
    expect(buildReport({ weight: 140, name: 'Ania' }, T, '#/', IPHONE).message).toBe('Nieznany błąd (object)');
  });
});

describe('throttle', () => {
  it('sends with keepalive as text/plain to /errors', () => {
    expect(reportError(new Error('boom'), T)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${PUSH_URL}/errors`);
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
    expect(JSON.parse(init.body as string).message).toBe('boom');
  });

  it('at most one report per minute', () => {
    expect(reportError(new Error('a'), T)).toBe(true);
    expect(reportError(new Error('b'), T + 30_000)).toBe(false);
    expect(reportError(new Error('b'), T + 60_001)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('the same message only once per session', () => {
    expect(reportError(new Error('same'), T)).toBe(true);
    expect(reportError(new Error('same'), T + 120_000)).toBe(false);
  });

  it('turned off: nothing is sent', () => {
    setErrorReports(false);
    expect(reportError(new Error('x'), T)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws, even when fetch throws synchronously', () => {
    fetchMock.mockImplementation(() => {
      throw new TypeError('no fetch');
    });
    expect(() => reportError(new Error('x'), T)).not.toThrow();
  });
});
