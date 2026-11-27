// Shared by the admin scripts. Same password derivation as the app (src/ranking/crypto.ts).
import { readFileSync } from 'node:fs';

export const URL_BASE = 'https://banana-gym-push.banana-gym-push.workers.dev';

export function b64u(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

/** PBKDF2-SHA-256(password NFC, salt bytes, iterations) → 32 bytes, base64url. */
export async function deriveKey(password, saltB64u, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(saltB64u, 'base64url'), iterations }, base, 256);
  return b64u(new Uint8Array(bits));
}

function adminToken() {
  return process.env.ADMIN_TOKEN ?? readFileSync(new URL('../../gym-app-private/admin-token.txt', import.meta.url), 'utf8').trim();
}

export function adminCall(path, body) {
  return fetch(URL_BASE + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
}
