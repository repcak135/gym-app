import { PUSH_URL } from '../push/config';
import type { ScorePayload } from './scores';

/** Same Worker as the push. */
const BASE = PUSH_URL;

export class ApiError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
    this.name = 'ApiError';
  }
}

export type Me = { nick: string; shareWorkouts: boolean; shareBench: boolean; mustChange: boolean };
export type Row = { nick: string; value: number };
export type Tables = { workouts: Row[]; bench: Row[] };
export type Ranking = { me: string; week: Tables; month: Tables };

async function call<T>(method: string, path: string, body?: object, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'text/plain' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0); // offline
  }
  if (!res.ok) throw new ApiError(res.status);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  salt: (nick: string) => call<{ salt: string; iterations: number }>('GET', `/account/salt?nick=${encodeURIComponent(nick)}`),
  join: (b: { nick: string; salt: string; iterations: number; key: string; shareWorkouts: boolean; shareBench: boolean }) =>
    call<{ token: string; nick: string }>('POST', '/account/join', b),
  login: (b: { nick: string; key: string }) => call<Me & { token: string }>('POST', '/account/login', b),
  me: (token: string) => call<Me>('GET', '/account/me', undefined, token),
  password: (token: string, b: { salt: string; iterations: number; key: string }) => call<void>('POST', '/account/password', b, token),
  sharing: (token: string, b: { shareWorkouts: boolean; shareBench: boolean }) => call<void>('POST', '/account/sharing', b, token),
  logout: (token: string) => call<void>('DELETE', '/account/session', undefined, token),
  leave: (token: string) => call<void>('DELETE', '/account', undefined, token),
  scores: (token: string, b: ScorePayload) => call<void>('POST', '/scores', b, token),
  ranking: (token: string, week: string, month: string) => call<Ranking>('GET', `/ranking?week=${week}&month=${month}`, undefined, token),
};
