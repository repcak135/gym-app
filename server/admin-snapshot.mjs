// Admin: copy the whole server (D1 tables + encrypted backup objects) to the owner's PC,
// so the weekly Google Drive backup holds it too. Backups stay encrypted there.
//   node server/admin-snapshot.mjs
// Output: C:\Claude\gym-app-private\server-snapshot\ (replaced each run). Files are split into
// parts below 14 MB, because the Drive backup script skips single files over 15 MB.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adminGet } from './admin-lib.mjs';

const PART = 14 * 1024 * 1024;
const dir = fileURLToPath(new URL('../../gym-app-private/server-snapshot/', import.meta.url));

function save(name, bytes) {
  if (bytes.length <= PART) return writeFileSync(dir + name, bytes);
  for (let i = 0, n = 1; i < bytes.length; i += PART, n++) writeFileSync(`${dir}${name}.part${String(n).padStart(3, '0')}`, bytes.subarray(i, i + PART));
}

const res = await adminGet('/admin/snapshot');
if (!res.ok) {
  console.error(`Błąd HTTP ${res.status}`);
  process.exit(1);
}
const snap = await res.json();
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir + 'objects', { recursive: true });
save('d1.json', Buffer.from(JSON.stringify(snap, null, 1)));
let bytes = 0;
for (const { object_key } of snap.tables.backups) {
  const o = await adminGet(`/admin/backup-object?key=${encodeURIComponent(object_key)}`);
  if (!o.ok) {
    console.error(`Nie pobrano ${object_key}: HTTP ${o.status}`);
    continue;
  }
  const data = Buffer.from(await o.arrayBuffer());
  bytes += data.length;
  save('objects/' + object_key.replace(/\//g, '__'), data);
}
writeFileSync(
  dir + 'README.txt',
  `Kopia serwera Banana Gym z ${new Date(snap.at).toISOString()}.\n` +
    'd1.json: tabele D1 bez sesji i bez kluczy odzyskiwania (hasła tylko jako skróty). objects/: zaszyfrowane kopie z R2 (klucz backups/<id>/<czas>.bin, "/" zamienione na "__").\n' +
    'Części .partNNN skleja się po kolei. Odtworzenie: server/README.md.\n',
);
console.log(`Zapisano ${dir}: ${Object.values(snap.tables).reduce((n, t) => n + t.length, 0)} wierszy D1, ${snap.tables.backups.length} kopii (${(bytes / 1024 / 1024).toFixed(1)} MB).`);
