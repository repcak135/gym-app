// Types for the app tests that import the admin helper (server/admin-lib.mjs).
export const URL_BASE: string;
export function b64u(bytes: Uint8Array): string;
export function deriveKey(password: string, saltB64u: string, iterations: number): Promise<string>;
export function adminCall(path: string, body: unknown): Promise<Response>;
export function adminGet(path: string): Promise<Response>;
