// Cloud backup crypto, Web Crypto only. No imports on purpose: the admin scripts run this same file
// with Node's built-in TypeScript support (server/admin-recover.mjs), so app and scripts cannot drift.
//
// Backup object: "BGB1" | flags (bit 0 = gzip) | 12-byte IV | AES-256-GCM(BK, AAD "banana-backup-v1").
// Lock 1 (password): PBKDF2-SHA-256(password, own salt) → AES-GCM key wrapping BK.
// Lock 2 (admin): ephemeral ECDH P-256 with the admin public key → HKDF-SHA-256 → AES-GCM wrapping BK.

export const WRAP_ITERATIONS = 300_000;
const MAGIC = [0x42, 0x47, 0x42, 0x31]; // "BGB1"
const te = new TextEncoder();

export type PwWrapped = { v: 1; kind: 'pw'; salt: string; iterations: number; iv: string; ct: string };
export type AdminWrapped = { v: 1; kind: 'admin'; kid: string; epk: string; iv: string; ct: string };

export function b64u(bytes: Uint8Array): string {
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64u(s: string): Uint8Array<ArrayBuffer> {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** A new 256-bit backup key (BK). */
export function newBackupKey(): Uint8Array<ArrayBuffer> {
  return random(32);
}

async function aesKey(raw: Uint8Array<ArrayBuffer>, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, usage);
}

async function gzip(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Response(data).body!.pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Response(data).body!.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Encrypts the backup JSON with BK (gzip first when the browser can). */
export async function encryptBackup(json: string, bk: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  let data = te.encode(json);
  let flags = 0;
  if (typeof CompressionStream === 'function') {
    try {
      data = await gzip(data);
      flags |= 1;
    } catch {
      // older browser without streams support: send it uncompressed (flag stays 0)
    }
  }
  const iv = random(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode('banana-backup-v1') }, await aesKey(bk, ['encrypt']), data));
  const out = new Uint8Array(4 + 1 + 12 + ct.length);
  out.set(MAGIC, 0);
  out[4] = flags;
  out.set(iv, 5);
  out.set(ct, 17);
  return out;
}

export async function decryptBackup(blob: Uint8Array<ArrayBuffer>, bk: Uint8Array<ArrayBuffer>): Promise<string> {
  if (blob.length < 17 + 16 || MAGIC.some((b, i) => blob[i] !== b)) throw new Error('Nieznany format kopii');
  const flags = blob[4];
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(5, 17), additionalData: te.encode('banana-backup-v1') }, await aesKey(bk, ['decrypt']), blob.slice(17)),
  );
  return new TextDecoder().decode(flags & 1 ? await gunzip(plain) : plain);
}

/**
 * The PBKDF2 salt is prefixed with a fixed label, so it can never equal the 16-byte login salt: even a
 * dishonest server, which sees the login key, cannot compute this key and plant a backup key of its own.
 */
async function passwordKek(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const label = te.encode('banana-bk-wrap-v1:');
  const full = new Uint8Array(label.length + salt.length);
  full.set(label, 0);
  full.set(salt, label.length);
  const base = await crypto.subtle.importKey('raw', te.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: full, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Lock 1: BK wrapped with the password (own random salt, so this key differs from the login key). */
export async function wrapWithPassword(bk: Uint8Array<ArrayBuffer>, password: string, iterations = WRAP_ITERATIONS): Promise<string> {
  const salt = random(16);
  const iv = random(12);
  const kek = await passwordKek(password, salt, iterations);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode('banana-bk-pw-v1') }, kek, bk));
  const w: PwWrapped = { v: 1, kind: 'pw', salt: b64u(salt), iterations, iv: b64u(iv), ct: b64u(ct) };
  return JSON.stringify(w);
}

/** Throws when the password is wrong (AES-GCM authentication fails) or the wrap is weaker than ours. */
export async function unwrapWithPassword(wrapped: string, password: string, minIterations = WRAP_ITERATIONS): Promise<Uint8Array<ArrayBuffer>> {
  const w = JSON.parse(wrapped) as PwWrapped;
  if (w.v !== 1 || w.kind !== 'pw') throw new Error('Nieznany format klucza');
  // A server must not be able to make offline guessing cheaper by lowering the count.
  if (!(w.iterations >= minIterations) || w.iterations > 5_000_000) throw new Error('Za słabe zabezpieczenie klucza');
  const kek = await passwordKek(password, unb64u(w.salt), w.iterations);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(w.iv), additionalData: te.encode('banana-bk-pw-v1') }, kek, unb64u(w.ct)));
}

async function adminAesKey(shared: ArrayBuffer, epkRaw: Uint8Array<ArrayBuffer>, usage: KeyUsage[]): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: epkRaw, info: te.encode('banana-admin-wrap-v1') },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  );
}

/** Lock 2: BK wrapped for the app owner's admin public key (raw P-256 point, base64url). */
export async function wrapForAdmin(bk: Uint8Array<ArrayBuffer>, adminPublicKey: string, kid: string): Promise<string> {
  const adminPub = await crypto.subtle.importKey('raw', unb64u(adminPublicKey), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const eph = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const epkRaw = new Uint8Array((await crypto.subtle.exportKey('raw', eph.publicKey)) as ArrayBuffer);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: adminPub }, eph.privateKey, 256);
  const iv = random(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode('banana-bk-admin-v1') }, await adminAesKey(shared, epkRaw, ['encrypt']), bk),
  );
  const w: AdminWrapped = { v: 1, kind: 'admin', kid, epk: b64u(epkRaw), iv: b64u(iv), ct: b64u(ct) };
  return JSON.stringify(w);
}

/** Admin side only (server/admin-recover.mjs): opens lock 2 with the admin private key (JWK). */
export async function unwrapForAdmin(wrapped: string, adminPrivateJwk: JsonWebKey): Promise<Uint8Array<ArrayBuffer>> {
  const w = JSON.parse(wrapped) as AdminWrapped;
  if (w.v !== 1 || w.kind !== 'admin') throw new Error('Unknown key format');
  const priv = await crypto.subtle.importKey('jwk', adminPrivateJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const epkRaw = unb64u(w.epk);
  const epk = await crypto.subtle.importKey('raw', epkRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: epk }, priv, 256);
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(w.iv), additionalData: te.encode('banana-bk-admin-v1') }, await adminAesKey(shared, epkRaw, ['decrypt']), unb64u(w.ct)),
  );
}

/** Short public id of a backup key (not secret-revealing): tells the server which key a backup uses. */
export async function backupKeyId(bk: Uint8Array<ArrayBuffer>): Promise<string> {
  const label = te.encode('banana-bk-id-v1:');
  const data = new Uint8Array(label.length + bk.length);
  data.set(label, 0);
  data.set(bk, label.length);
  return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', data)).slice(0, 8));
}

/** Admin key pair for server/admin-keygen.mjs: public = raw point (base64url), private = JWK. */
export async function newAdminKeyPair(): Promise<{ publicKey: string; privateJwk: JsonWebKey }> {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  return { publicKey: b64u(new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer)), privateJwk: await crypto.subtle.exportKey('jwk', kp.privateKey) };
}
