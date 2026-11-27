import type { PushSub } from './webpush';

export const ORIGINS = ['https://repcak135.github.io', 'http://localhost:5173'];
export const MAX_BODY = 4096;
export const MAX_AHEAD_MS = 30 * 60 * 1000;
export const MAX_SCHEDULES_PER_HOUR = 60;

const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];

export type Pending = { endsAt: number; title: string; body: string };

export function isId(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
}

export function newId(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Only known push services: the Worker can never be made to POST anywhere else. */
export function isAllowedEndpoint(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.port === '' && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
}

export function parseSubscription(v: unknown): PushSub | null {
  const s = v as PushSub | null;
  if (!s || typeof s.endpoint !== 'string' || s.endpoint.length > 1024 || !isAllowedEndpoint(s.endpoint)) return null;
  const k = s.keys;
  if (!k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || k.p256dh.length > 200 || k.auth.length > 100) return null;
  return { endpoint: s.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } };
}

export function parseSchedule(v: unknown, now: number): Pending | null {
  const b = v as Partial<Pending> | null;
  if (!b || typeof b.endsAt !== 'number' || !Number.isFinite(b.endsAt)) return null;
  if (b.endsAt < now - 5000 || b.endsAt > now + MAX_AHEAD_MS) return null;
  const title = typeof b.title === 'string' && b.title ? b.title.slice(0, 60) : 'Koniec przerwy';
  const body = typeof b.body === 'string' ? b.body.slice(0, 120) : '';
  return { endsAt: b.endsAt, title, body };
}
