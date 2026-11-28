# Banana Gym push server

A Cloudflare Worker (free plan) that sends the "Koniec przerwy" Web Push when a rest ends while the app is hidden or the phone is locked, and stores the app's crash reports. Design: `docs/superpowers/specs/2026-11-27-rest-push-design.md`.

- One SQLite Durable Object per device id holds only the push subscription and at most one pending push. Its alarm sends the push at the rest end and deletes the entry.
- Routes: `POST /subscribe`, `DELETE /subscribe`, `POST /schedule`, `POST /cancel`. Only the app's origins; only known push-service hosts; `endsAt` within 30 minutes; 4 KB bodies; 60 schedules per device per hour.
- Web Push (VAPID + aes128gcm) is our own code on Web Crypto: `src/webpush.ts`, tested against the RFC 8291 example.

## Deploy

```sh
cd server
npm install
npx wrangler login          # once, in the owner's browser
npx wrangler deploy
```

Live at https://banana-gym-push.banana-gym-push.workers.dev.

## Keys

- The VAPID public key is in `wrangler.toml` (`VAPID_PUBLIC_KEY`) and in the app's `.env` (`VITE_VAPID_PUBLIC_KEY`). Both must match.
- The private key (a P-256 JWK) is **only** a Cloudflare secret: `npx wrangler secret put VAPID_PRIVATE_KEY`. Never commit it.
- New keys mean every phone must turn the switch off and on again.

## Ranking and accounts

- D1 database `banana-gym` (binding `DB`), schema in `migrations/`. Apply a new migration with `npx wrangler d1 migrations apply banana-gym --remote`.
- Routes in `src/accounts.ts`: `/account/salt|join|login|me|password|sharing|session`, `DELETE /account`, `POST /scores`, `GET /ranking`, `POST /admin/reset|remove`.
- Admin token: Cloudflare secret `ADMIN_TOKEN`, copy in `C:\Claude\gym-app-private\admin-token.txt`. Never commit it.
  - `node server/admin-reset.mjs <nick>`: prints a temporary password once; the member must change it at login.
  - `node server/admin-remove.mjs <nick>`: deletes the member and their scores.
- Inspect: `npx wrangler d1 execute banana-gym --remote --command "SELECT nick, share_workouts, share_bench, must_change FROM members"`.
- Secret `SALT_SECRET` (random, not stored elsewhere; replace freely): HMAC key for fake salts of unknown nicks, so `/account/salt` does not reveal which nicks exist.
- Optional secret `JOIN_CODE`: when set, joining needs that code.

## Cloud backup (R2)

- Bucket `banana-gym-backups` (binding `BACKUPS`). Routes in `src/cloud.ts`: `PUT /backup` (binary, header `X-Key-Id`), `GET /backup/latest|list|keys`, `POST /backup/keys`, `DELETE /backup`, `POST /stats/exercises`; admin `GET|POST /admin/backup-keys`, `GET /admin/snapshot`, `GET /admin/backup-object`.
- The server never decrypts: the phone sends AES-GCM ciphertext; D1 `backup_keys` holds the backup key wrapped with the password and with the admin public key (`src/cloud/crypto.ts`, shared with the scripts).
- **Free-tier caps (the owner's account has a payment card; never exceed):** per member 3 objects / 30 MB, 20 uploads a day, 2 000 downloads a month; globally 5 GB stored and 20 000 uploads a month. Check usage: `npx wrangler d1 execute banana-gym --remote --command "SELECT COUNT(*) AS objects, SUM(size)/1048576.0 AS mb FROM backups"` and the R2 page of the Cloudflare dashboard. The owner has (or should have) a billing notification at 0.01 USD.
- Admin key pair: created once with `node server/admin-keygen.mjs` (refuses to overwrite). Private key only in `C:\Claude\gym-app-private\banana-admin-recovery.json` (weekly Drive backup); public key + kid in the app's `.env`.
- `node server/admin-recover.mjs <nick>`: shows the last backup date, asks "tak", then sets a temporary password, re-wraps the backup key with it and prints the password once. `admin-reset.mjs` refuses members with a cloud backup.
- `node server/admin-snapshot.mjs`: D1 tables (without sessions) + all encrypted objects into `C:\Claude\gym-app-private\server-snapshot\` (parts < 14 MB). The Sunday Drive backup task should run it first.

## Crash reports

- The app sends `POST /errors` (version, message, a few stack lines, screen path, coarse device, time; no workout data). One `ErrorLog` Durable Object keeps the newest 500 reports, at most 30 days. 10 reports per minute per IP (counted in memory, IPs are not stored).
- Read them: `node server/read-errors.mjs [limit]` from the repo root. It sends `Authorization: Bearer <token>` to `GET /errors`; the token is read from `$ERRORS_TOKEN` or `C:\Claude\gym-app-private\errors-token.txt`.
- The token is only a Cloudflare secret (`npx wrangler secret put ERRORS_TOKEN`) plus that private file. Never commit it. Without the secret, `GET /errors` always answers 401.

## Logs and tests

- `npx wrangler tail` shows live logs (push failures are logged as `{"push":"failed"}`).
- Tests run with the app's tests from the repo root: `npx vitest run server`.
