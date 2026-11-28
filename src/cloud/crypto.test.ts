// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { b64u, backupKeyId, decryptBackup, encryptBackup, newAdminKeyPair, newBackupKey, unb64u, unwrapForAdmin, unwrapWithPassword, wrapForAdmin, wrapWithPassword } from './crypto';
// The admin scripts use this helper for the login key; recovery must work with both together.
import { deriveKey } from '../../server/admin-lib.mjs';

const IT = 1000; // fast in tests; the app uses 300 000

describe('backup object', () => {
  it('round trip, gzip flag set, not readable as plain text', async () => {
    const bk = newBackupKey();
    const json = JSON.stringify({ app: 'gym-app', note: 'Wyciskanie 100 kg × 5'.repeat(50) });
    const blob = await encryptBackup(json, bk);
    expect([...blob.slice(0, 4)]).toEqual([0x42, 0x47, 0x42, 0x31]);
    expect(blob[4] & 1).toBe(1);
    expect(new TextDecoder().decode(blob)).not.toContain('Wyciskanie');
    expect(blob.length).toBeLessThan(json.length / 4); // compressed
    expect(await decryptBackup(blob, bk)).toBe(json);
  });

  it('a wrong key or a changed byte fails', async () => {
    const bk = newBackupKey();
    const blob = await encryptBackup('{"a":1}', bk);
    await expect(decryptBackup(blob, newBackupKey())).rejects.toThrow();
    const bad = new Uint8Array(blob);
    bad[bad.length - 1] ^= 1;
    await expect(decryptBackup(bad, bk)).rejects.toThrow();
    await expect(decryptBackup(new TextEncoder().encode('{"plain":true}xxxxxxxxxxxxxxxxxxxxxxxxxxx') as Uint8Array<ArrayBuffer>, bk)).rejects.toThrow(/format/);
  });
});

describe('locks', () => {
  it('a dishonest server cannot plant its own key using the login key it sees', async () => {
    // The server knows K = PBKDF2(password, loginSalt) from the login and builds a wrap with it.
    const loginSalt = 'AAAAAAAAAAAAAAAAAAAAAA';
    const k = unb64u(await deriveKey('moje-hasło-1', loginSalt, 300_000));
    const evilBk = newBackupKey();
    const aes = await crypto.subtle.importKey('raw', k, 'AES-GCM', false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('banana-bk-pw-v1') }, aes, evilBk));
    const forged = JSON.stringify({ v: 1, kind: 'pw', salt: loginSalt, iterations: 300_000, iv: b64u(iv), ct: b64u(ct) });
    await expect(unwrapWithPassword(forged, 'moje-hasło-1')).rejects.toThrow();
  }, 30_000);

  it('a wrap with fewer iterations than ours is refused (cheaper guessing)', async () => {
    const w = await wrapWithPassword(newBackupKey(), 'haslo-123', IT);
    await expect(unwrapWithPassword(w, 'haslo-123')).rejects.toThrow(/słabe/);
  });

  it('key id: same key → same id, other key → other id, 11 chars', async () => {
    const bk = newBackupKey();
    expect(await backupKeyId(bk)).toBe(await backupKeyId(new Uint8Array(bk)));
    expect(await backupKeyId(bk)).not.toBe(await backupKeyId(newBackupKey()));
    expect(await backupKeyId(bk)).toMatch(/^[A-Za-z0-9_-]{11}$/);
  });

  it('password lock: right password opens, wrong one throws; the wrap differs from the login key', async () => {
    const bk = newBackupKey();
    const w = await wrapWithPassword(bk, 'moje-hasło-1', IT);
    expect(JSON.parse(w)).toMatchObject({ v: 1, kind: 'pw', iterations: IT });
    expect(b64u(await unwrapWithPassword(w, 'moje-hasło-1', 1))).toBe(b64u(bk));
    await expect(unwrapWithPassword(w, 'moje-hasło-2', 1)).rejects.toThrow();
    const salt = JSON.parse(w).salt as string;
    expect(JSON.stringify(w)).not.toContain(await deriveKey('moje-hasło-1', salt, IT));
  });

  it('password change: re-wrap opens with the new password only', async () => {
    const bk = newBackupKey();
    const w2 = await wrapWithPassword(bk, 'nowe-hasło-22', IT);
    expect(b64u(await unwrapWithPassword(w2, 'nowe-hasło-22', 1))).toBe(b64u(bk));
    await expect(unwrapWithPassword(w2, 'stare-hasło-11', 1)).rejects.toThrow();
  });

  it('admin lock opens only with the admin private key', async () => {
    const admin = await newAdminKeyPair();
    const other = await newAdminKeyPair();
    const bk = newBackupKey();
    const w = await wrapForAdmin(bk, admin.publicKey, 'k1');
    expect(JSON.parse(w)).toMatchObject({ v: 1, kind: 'admin', kid: 'k1' });
    expect(b64u(await unwrapForAdmin(w, admin.privateJwk))).toBe(b64u(bk));
    await expect(unwrapForAdmin(w, other.privateJwk)).rejects.toThrow();
  });

  it('admin recovery end to end: lost password → admin opens lock 2 → temporary password → backup opens → new password', async () => {
    const admin = await newAdminKeyPair();
    // Phone: switch on cloud backup and upload.
    const bk = newBackupKey();
    const pwWrapped = await wrapWithPassword(bk, 'zapomniane-hasło', IT);
    const adminWrapped = await wrapForAdmin(bk, admin.publicKey, 'k1');
    const backup = await encryptBackup('{"workouts":[1,2,3]}', bk);
    // Owner's PC (admin-recover.mjs): open lock 2, wrap with a temporary password.
    const recovered = await unwrapForAdmin(adminWrapped, admin.privateJwk);
    const tempWrapped = await wrapWithPassword(recovered, 'Tymczas0weHa', IT);
    expect(tempWrapped).not.toBe(pwWrapped);
    // New phone: log in with the temporary password, open the backup, set a new password.
    const onPhone = await unwrapWithPassword(tempWrapped, 'Tymczas0weHa', 1);
    expect(await decryptBackup(backup, onPhone)).toBe('{"workouts":[1,2,3]}');
    const finalWrapped = await wrapWithPassword(onPhone, 'moje-nowe-hasło', IT);
    expect(await decryptBackup(backup, await unwrapWithPassword(finalWrapped, 'moje-nowe-hasło', 1))).toBe('{"workouts":[1,2,3]}');
  });
});
