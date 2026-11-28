// Admin: recover the cloud backup of a member who forgot the password (and maybe lost the phone).
//   node server/admin-recover.mjs <nick>
// Opens the admin lock with the private key on this PC, sets a temporary password, wraps the backup key
// with it and prints the temporary password ONCE. The app asks for a new password at the next login.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { adminCall, adminGet, b64u, deriveKey } from './admin-lib.mjs';
import { unwrapForAdmin, wrapWithPassword } from '../src/cloud/crypto.ts';

const nick = process.argv[2];
if (!nick) {
  console.error('Użycie: node server/admin-recover.mjs <nick>');
  process.exit(1);
}
const keyFile = new URL('../../gym-app-private/banana-admin-recovery.json', import.meta.url);
const admin = JSON.parse(readFileSync(keyFile, 'utf8'));

const res = await adminGet(`/admin/backup-keys?nick=${encodeURIComponent(nick)}`);
if (res.status === 404) {
  console.error(`Nie ma użytkownika ${nick}.`);
  process.exit(1);
}
if (!res.ok) {
  console.error(`Błąd HTTP ${res.status}`);
  process.exit(1);
}
const info = await res.json();
if (!info.adminWrapped) {
  console.error(`${info.nick} nie ma kopii w chmurze. Do samego hasła użyj admin-reset.mjs.`);
  process.exit(1);
}
const wrapped = JSON.parse(info.adminWrapped);
if (wrapped.kid !== admin.kid) {
  console.error(`Kopia zamknięta innym kluczem (${wrapped.kid}), a na tym komputerze jest ${admin.kid}.`);
  process.exit(1);
}
const last = info.lastBackupAt ? new Date(info.lastBackupAt).toLocaleString('pl-PL') : 'brak kopii';
console.log(`Użytkownik: ${info.nick}. Ostatnia kopia: ${last} (kopii: ${info.backups}).`);
if (!process.argv.includes('--yes')) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('Ustawić hasło tymczasowe i odzyskać kopię? Wpisz "tak": ')).trim().toLowerCase();
  rl.close();
  if (answer !== 'tak') {
    console.log('Przerwano, nic nie zmieniono.');
    process.exit(0);
  }
}

const bk = await unwrapForAdmin(info.adminWrapped, admin.privateJwk);
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const password = [...randomBytes(12)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
const iterations = 300_000;
const salt = b64u(randomBytes(16));
const key = await deriveKey(password, salt, iterations);
const pwWrapped = await wrapWithPassword(bk, password);
const put = await adminCall('/admin/backup-keys', { nick: info.nick, salt, iterations, key, pwWrapped });
if (put.status !== 204) {
  console.error(`Błąd HTTP ${put.status}, nic nie zmieniono.`);
  process.exit(1);
}
console.log(`Hasło tymczasowe dla ${info.nick}: ${password}`);
console.log('Przekaż je osobiście lub w wiadomości. Po zalogowaniu aplikacja poprosi o nowe hasło, a kopię da się przywrócić.');
