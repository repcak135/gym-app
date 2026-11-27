import { updateSettings } from '../data/settings';
import type { Sex } from '../data/dots';
import { api, ApiError } from './api';

/** PBKDF2 iterations for new passwords (stored per member on the server, so it can be raised). */
export const ITERATIONS = 300_000;
const LAST_SENT = 'gym.rankLastSent';

function b64u(bytes: Uint8Array): string {
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64u(s: string): Uint8Array<ArrayBuffer> {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

export function randomSalt(): string {
  return b64u(crypto.getRandomValues(new Uint8Array(16)));
}

/** The password never leaves the phone: only this PBKDF2-SHA-256 key does (same as server/admin-lib.mjs). */
export async function deriveKey(password: string, salt: string, iterations: number): Promise<string> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64u(salt), iterations }, base, 256);
  return b64u(new Uint8Array(bits));
}

export const NICK_RE = /^[\p{L}\p{N}_-]{3,20}$/u;
export const MIN_PASSWORD = 8;

export function forgetLastSent(): void {
  try {
    localStorage.removeItem(LAST_SENT);
  } catch {
    // private mode
  }
}

export function lastSent(): string | null {
  try {
    return localStorage.getItem(LAST_SENT);
  } catch {
    return null;
  }
}

export function markSent(json: string): void {
  try {
    localStorage.setItem(LAST_SENT, json);
  } catch {
    // private mode: the next start sends again
  }
}

/** Polish message for an API error. */
export function errorText(e: unknown): string {
  const s = e instanceof ApiError ? e.status : -1;
  if (s === 0) return 'Brak połączenia z internetem. Spróbuj ponownie.';
  if (s === 401) return 'Zły nick albo hasło.';
  if (s === 404) return 'Nie ma takiego nicku.';
  if (s === 409) return 'Ten nick jest już zajęty. Wybierz inny.';
  if (s === 429) return 'Za dużo prób. Odczekaj 15 minut i spróbuj ponownie.';
  if (s === 403) return 'Dołączanie jest teraz zamknięte.';
  return 'Coś poszło nie tak. Spróbuj ponownie za chwilę.';
}

async function signedIn(token: string, nick: string, sex: Sex, shareWorkouts: boolean, shareBench: boolean) {
  forgetLastSent();
  await updateSettings({ rankToken: token, rankNick: nick, rankSex: sex, rankShareWorkouts: shareWorkouts, rankShareBench: shareBench });
}

export async function joinRanking(o: { nick: string; password: string; sex: Sex; shareWorkouts: boolean; shareBench: boolean }): Promise<void> {
  const salt = randomSalt();
  const key = await deriveKey(o.password, salt, ITERATIONS);
  const r = await api.join({ nick: o.nick.normalize('NFC').trim(), salt, iterations: ITERATIONS, key, shareWorkouts: o.shareWorkouts, shareBench: o.shareBench });
  await signedIn(r.token, r.nick, o.sex, o.shareWorkouts, o.shareBench);
}

/** Returns true when the member must set a new password first (after an admin reset). */
export async function loginRanking(o: { nick: string; password: string; sex: Sex }): Promise<boolean> {
  const nick = o.nick.normalize('NFC').trim();
  const s = await api.salt(nick);
  const key = await deriveKey(o.password, s.salt, s.iterations);
  const r = await api.login({ nick, key });
  await signedIn(r.token, r.nick, o.sex, r.shareWorkouts, r.shareBench);
  return r.mustChange;
}

export async function changePassword(token: string, password: string): Promise<void> {
  const salt = randomSalt();
  await api.password(token, { salt, iterations: ITERATIONS, key: await deriveKey(password, salt, ITERATIONS) });
}

export async function updateSharing(token: string, shareWorkouts: boolean, shareBench: boolean): Promise<void> {
  await api.sharing(token, { shareWorkouts, shareBench });
  forgetLastSent();
  await updateSettings({ rankShareWorkouts: shareWorkouts, rankShareBench: shareBench });
}

/** Forgets the account on this phone (sex stays for the next login). */
export async function signOutLocally(): Promise<void> {
  forgetLastSent();
  await updateSettings({ rankToken: undefined, rankNick: undefined, rankShareWorkouts: undefined, rankShareBench: undefined });
}

export async function logout(token: string): Promise<void> {
  await api.logout(token).catch(() => {});
  await signOutLocally();
}

export async function leaveRanking(token: string): Promise<void> {
  await api.leave(token);
  await signOutLocally();
}
