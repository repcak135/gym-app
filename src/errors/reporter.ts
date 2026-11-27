import { APP_VERSION } from '../version';
import { PUSH_URL } from '../push/config';

/**
 * Crash reports to our Cloudflare Worker (POST /errors). Only: app version, error message, the first
 * stack lines, the screen path, a coarse device string and the time. Never workout data. Queries
 * ("?...") are stripped everywhere: shared plan links carry plan data there.
 * Fire and forget: reporting never throws and never waits.
 */

export type ErrorReportBody = { version: string; message: string; stack: string; path: string; device: string; at: number };

const MIN_GAP_MS = 60_000;
const LAST_KEY = 'gym.lastErrorReport';
let enabled = true;
let lastInMemory = 0;
const seen = new Set<string>();

/** Ustawienia › "Wysyłaj raporty błędów" (on unless turned off). */
export function setErrorReports(on: boolean): void {
  enabled = on;
}

/** Drops "?query" from URLs; keeps the ":line:col" of stack frames. */
export function stripQuery(s: string): string {
  return s.replace(/\?[^\s#):]*/g, '');
}

export function deviceString(ua: string): string {
  const major = (re: RegExp) => re.exec(ua)?.[1];
  if (/iPhone|iPad|iPod/.test(ua)) {
    const ios = major(/Version\/(\d+)/) ?? major(/OS (\d+)_/);
    return `${/iPad/.test(ua) ? 'iPad' : 'iPhone'}${ios ? `, iOS ${ios}` : ''}`;
  }
  const browser = /Edg\//.test(ua)
    ? `Edge ${major(/Edg\/(\d+)/)}`
    : /Firefox\//.test(ua)
      ? `Firefox ${major(/Firefox\/(\d+)/)}`
      : /Chrome\//.test(ua)
        ? `Chrome ${major(/Chrome\/(\d+)/)}`
        : /Safari\//.test(ua)
          ? `Safari ${major(/Version\/(\d+)/) ?? ''}`.trim()
          : 'inna przeglądarka';
  const android = major(/Android (\d+)/);
  const os = android ? `Android ${android}` : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'inny system';
  return `${os}, ${browser}`;
}

/** Only an Error's own message or a plain string; any other rejected value could carry data. */
function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === 'string') return err;
  return `Nieznany błąd (${err === null ? 'null' : typeof err})`;
}

export function buildReport(err: unknown, now: number, hash: string, ua: string): ErrorReportBody {
  const stack = err instanceof Error && err.stack ? err.stack.split('\n').slice(0, 6).join('\n') : '';
  return {
    version: APP_VERSION,
    message: stripQuery(messageOf(err)).slice(0, 500),
    stack: stripQuery(stack).slice(0, 2048),
    path: (hash || '#/').split('?')[0].slice(0, 100),
    device: deviceString(ua).slice(0, 60),
    at: now,
  };
}

function lastSent(): number {
  try {
    return Number(localStorage.getItem(LAST_KEY) ?? 0) || lastInMemory;
  } catch {
    return lastInMemory;
  }
}

function markSent(now: number): void {
  lastInMemory = now;
  try {
    localStorage.setItem(LAST_KEY, String(now));
  } catch {
    // private mode: the in-memory time still throttles this session
  }
}

/** Sends one report unless turned off, already sent this session, or another went out in the last minute. */
export function reportError(err: unknown, now = Date.now()): boolean {
  try {
    if (!enabled || !PUSH_URL) return false;
    const report = buildReport(err, now, location.hash, navigator.userAgent);
    if (seen.has(report.message)) return false;
    if (now - lastSent() < MIN_GAP_MS) return false;
    seen.add(report.message);
    markSent(now);
    fetch(`${PUSH_URL}/errors`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(report) }).catch(
      () => {},
    );
    return true;
  } catch {
    return false;
  }
}

export function installErrorReporting(): void {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
}

/** Tests only. */
export function resetErrorReporting(): void {
  enabled = true;
  lastInMemory = 0;
  seen.clear();
  try {
    localStorage.removeItem(LAST_KEY);
  } catch {
    // ignore
  }
}
