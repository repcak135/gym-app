// Admin: give a member who forgot their password a temporary one.
//   node server/admin-reset.mjs <nick>
// Prints the temporary password ONCE; the member must change it at the next login.
// The admin token comes from $ADMIN_TOKEN or C:\Claude\gym-app-private\admin-token.txt (never in git).
import { adminCall, deriveKey, b64u } from './admin-lib.mjs';
import { randomBytes } from 'node:crypto';

const nick = process.argv[2];
if (!nick) {
  console.error('Użycie: node server/admin-reset.mjs <nick>');
  process.exit(1);
}
// 12 chars without look-alikes (0/O, 1/l/I).
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const password = [...randomBytes(12)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
const iterations = 300_000;
const salt = b64u(randomBytes(16));
const key = await deriveKey(password, salt, iterations);
const res = await adminCall('/admin/reset', { nick, salt, iterations, key });
if (res.status === 204) {
  console.log(`Hasło tymczasowe dla ${nick}: ${password}`);
  console.log('Przekaż je osobiście lub w wiadomości. Przy logowaniu aplikacja poprosi o nowe hasło.');
} else {
  console.error(res.status === 404 ? `Nie ma użytkownika ${nick}.` : `Błąd HTTP ${res.status}`);
  process.exit(1);
}
