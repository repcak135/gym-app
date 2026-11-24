import { extractPayload } from './planShare';
import { EXERCISES_ROUTE } from './exerciseShare';

export type RoutedPayload =
  | { kind: 'plan'; data: string; path: string }
  | { kind: 'exercises'; data: string; path: string }
  | { kind: 'unknown' };

/** Decides where a scanned or pasted text leads: a shared plan, shared exercises, or nothing of ours. */
export function routePayload(text: string): RoutedPayload {
  const data = extractPayload(text);
  if (!data) return { kind: 'unknown' };
  if (text.includes(`#${EXERCISES_ROUTE}?`)) {
    return { kind: 'exercises', data, path: `${EXERCISES_ROUTE}?d=${data}` };
  }
  if (/#\/plan\?/.test(text)) return { kind: 'plan', data, path: `/plan?d=${data}` };
  return { kind: 'unknown' };
}
