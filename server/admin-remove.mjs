// Admin: remove a member and all their ranking rows.
//   node server/admin-remove.mjs <nick>
import { adminCall } from './admin-lib.mjs';

const nick = process.argv[2];
if (!nick) {
  console.error('Użycie: node server/admin-remove.mjs <nick>');
  process.exit(1);
}
const res = await adminCall('/admin/remove', { nick });
if (res.status === 204) console.log(`Usunięto ${nick} z rankingu.`);
else {
  console.error(res.status === 404 ? `Nie ma użytkownika ${nick}.` : `Błąd HTTP ${res.status}`);
  process.exit(1);
}
