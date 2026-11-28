// Admin: create the recovery key pair ONCE.
//   node server/admin-keygen.mjs
// The private key goes only to C:\Claude\gym-app-private\banana-admin-recovery.json (never git, never Cloudflare).
// The public key and its id are printed for the app's .env (VITE_ADMIN_RECOVERY_KEY, VITE_ADMIN_RECOVERY_KID).
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { newAdminKeyPair } from '../src/cloud/crypto.ts';

const file = fileURLToPath(new URL('../../gym-app-private/banana-admin-recovery.json', import.meta.url));
if (existsSync(file)) {
  console.error(`Klucz już istnieje: ${file}. Nie nadpisuję (stare kopie dałoby się wtedy odzyskać tylko starym kluczem).`);
  process.exit(1);
}
const { publicKey, privateJwk } = await newAdminKeyPair();
const kid = `k${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
writeFileSync(file, JSON.stringify({ kid, publicKey, privateJwk, createdAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
console.log(`Zapisano klucz prywatny: ${file}`);
console.log('Ten plik jest w cotygodniowej kopii na Google Drive. Nie wysyłaj go nigdzie indziej.');
console.log(`VITE_ADMIN_RECOVERY_KID=${kid}`);
console.log(`VITE_ADMIN_RECOVERY_KEY=${publicKey}`);
