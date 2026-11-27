// Web Push on Web Crypto only: VAPID (RFC 8292, ES256 JWT) and aes128gcm payload encryption (RFC 8291).

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type Vapid = { publicKey: string; privateJwk: JsonWebKey; subject: string };

const enc = new TextEncoder();

export function b64u(bytes: Uint8Array | ArrayBuffer): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64u(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** HKDF (RFC 5869) with one expand block, enough for lengths ≤ 32. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

/** Encrypts one push message (single record, record size 4096). salt and serverKeys are for tests. */
export async function encryptPayload(
  payload: Uint8Array,
  p256dh: string,
  auth: string,
  salt: Uint8Array = crypto.getRandomValues(new Uint8Array(16)),
  serverKeys?: CryptoKeyPair,
): Promise<Uint8Array> {
  const uaPublic = unb64u(p256dh);
  const keys = serverKeys ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', keys.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, keys.privateKey, 256));
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(unb64u(auth), ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(payload, new Uint8Array([2]))));
  const header = concat(salt, new Uint8Array([0, 0, 16, 0, asPublic.length]), asPublic);
  return concat(header, cipher);
}

/** VAPID JWT (ES256) for the push service origin. */
export async function vapidJwt(audience: string, subject: string, privateJwk: JsonWebKey, now = Date.now()): Promise<string> {
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64u(sig)}`;
}

export async function sendPush(sub: PushSub, payload: object, vapid: Vapid): Promise<Response> {
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), sub.keys.p256dh, sub.keys.auth);
  const jwt = await vapidJwt(new URL(sub.endpoint).origin, vapid.subject, vapid.privateJwk);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      TTL: '60',
      Urgency: 'high',
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    },
    body,
  });
}
