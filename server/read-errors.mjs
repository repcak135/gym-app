// Prints the newest crash reports: node server/read-errors.mjs [limit]
// The token comes from $ERRORS_TOKEN or C:\Claude\gym-app-private\errors-token.txt (never in git).
import { readFileSync } from 'node:fs';

const URL_BASE = 'https://banana-gym-push.banana-gym-push.workers.dev';
const token = process.env.ERRORS_TOKEN ?? readFileSync(new URL('../../gym-app-private/errors-token.txt', import.meta.url), 'utf8').trim();
const limit = Number(process.argv[2] ?? 20);

const res = await fetch(`${URL_BASE}/errors?limit=${limit}`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const reports = await res.json();
if (!reports.length) console.log('Brak raportów.');
for (const r of reports) {
  console.log(`${new Date(r.receivedAt).toISOString()}  v${r.version}  ${r.device}  ${r.path}`);
  console.log(`  ${r.message}`);
  if (r.stack) console.log(r.stack.split('\n').map((l) => `    ${l}`).join('\n'));
}
