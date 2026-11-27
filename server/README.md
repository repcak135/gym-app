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

## Crash reports

- The app sends `POST /errors` (version, message, a few stack lines, screen path, coarse device, time; no workout data). One `ErrorLog` Durable Object keeps the newest 500 reports, at most 30 days. 10 reports per minute per IP (counted in memory, IPs are not stored).
- Read them: `node server/read-errors.mjs [limit]` from the repo root. It sends `Authorization: Bearer <token>` to `GET /errors`; the token is read from `$ERRORS_TOKEN` or `C:\Claude\gym-app-private\errors-token.txt`.
- The token is only a Cloudflare secret (`npx wrangler secret put ERRORS_TOKEN`) plus that private file. Never commit it. Without the secret, `GET /errors` always answers 401.

## Logs and tests

- `npx wrangler tail` shows live logs (push failures are logged as `{"push":"failed"}`).
- Tests run with the app's tests from the repo root: `npx vitest run server`.
