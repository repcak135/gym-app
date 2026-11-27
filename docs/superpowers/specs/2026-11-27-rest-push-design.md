# Rest-end push notification: design

Date: 2026-11-27. Status: approved by the owner on 2026-11-27.
Part 1 of 3 of the server work, in this order: push, then a friends' ranking, then cloud backup. Ranking and backup get their own designs; both need an explicit opt-in screen with a choice of which data to share (owner's requirement).

## Why

The owner trains with music and the phone locked or in a pocket. Today the end-of-rest sound only plays while Banana Gym is open and on screen: iPhone suspends web apps in the background, and a web app cannot show a lock-screen timer. Friends on Android hit the same wall. A push notification from a server is the only way a web app can make the phone react when it is locked.

Success: during a real workout the owner locks the phone, and when the rest ends the phone shows and sounds "Koniec przerwy", on time (within ~2 s), without stopping the music.

## Goals

- A notification "Koniec przerwy", with the next set and exercise in the text, when a rest ends while the app is in the background or the screen is locked.
- Opt-in only: Ustawienia › Koniec przerwy › "Powiadomienie przy zablokowanym ekranie", off by default. Turning it on asks the system permission.
- "+15 s" and "Pomiń" move or cancel the pending notification. A new set's rest replaces it.
- No double alert: while the app is open and visible, only the in-app sound/banner, never the push.
- Tapping the notification opens the workout.
- Works on iPhone (iOS 16.4+, app added to the Home Screen) and Android Chrome.

## Non-goals

- A live countdown on the lock screen (impossible for web apps; owner accepted this).
- An "until 16:32" notification when leaving the app (owner rejected it: two buzzes per rest).
- Accounts, ranking, backup: later designs.

## Anti-goals (a failure even if it works)

- Any workout data (weights, exercises, history, names) stored on the server.
- A push while the app is on screen (doubles with the in-app sound; on iPhone every push must show a notification).
- Stopping or interrupting the owner's music beyond the normal system notification sound.
- Any running cost. Everything stays on Cloudflare's free plan.

## Constraints

- Static app stays on GitHub Pages (https://repcak135.github.io/gym-app/). The server is a separate Cloudflare Worker.
- Free plan only: Workers + Durable Objects (SQLite-backed, free tier). No Queues (paid), no cron-based timing (up to 60 s late).
- iPhone rule: every push received must display a notification, or iOS may revoke the subscription. So the server must not send when the app is visible, and the service worker always shows something when a push arrives.
- iPhone web push needs the app installed to the Home Screen. In plain Safari the setting is shown disabled with a one-line hint.
- Privacy: the server only ever holds the push subscription (an anonymous endpoint + keys the browser generates) and one pending end time with a short text. It deletes the pending entry after sending.
- The owner creates the Cloudflare account themselves; Claude never signs up or handles their password. Deploying needs `wrangler login` in the owner's browser once.
- Public AGPL repo: VAPID private key and any secret live only in Cloudflare secrets, never in git.

## Approaches considered

1. **Durable Object with an alarm per device** (chosen). Each subscription maps to one Durable Object; `schedule` stores the end time and sets `storage.setAlarm(endsAt)`; the alarm handler sends the push. Accurate to about a second, cancel = delete the alarm. Free plan.
2. Cron trigger every minute scanning due rests in D1/KV. Simpler, but up to 60 s late, which is useless for 60–120 s rests.
3. Cloudflare Queues with a delivery delay. Accurate, but not on the free plan.

## When the app talks to the server

The app tells the server only while it is not visible:

- On `visibilitychange` → hidden (and `pagehide`) while a rest is running: `POST /schedule { endsAt, title, body }` with `fetch(..., { keepalive: true })`.
- On `visibilitychange` → visible: `POST /cancel` (the in-app timer/banner takes over, which already handles a rest that ended while hidden).
- "+15 s", "Pomiń" and a new rest only change local state while visible, so nothing is sent. If they ever happen while hidden (they cannot from the UI), the next hide re-sends.

Risk: iPhone may drop the request fired at the moment of locking. **First build step is a spike** on the owner's iPhone: lock the phone during a rest and check that the server received `/schedule`. If it does not arrive reliably, fall back to scheduling at rest start and on every change ("+15 s", "Pomiń", new set), and cancelling when the app is visible at rest end. The service worker then suppresses nothing (iOS forbids it), so in that fallback the app must cancel a few seconds before the end while visible.

**Spike result (2026-11-27):** the owner locked the iPhone during 7 rests; all 7 `/schedule` requests arrived (consecutive sequence numbers, no gaps) within 68–407 ms. The owner stopped before 10; Claude accepted 7/7 with no loss and shipped the hide/show design.

**Owner's decision (2026-11-27):** if the spike fails, ship the fallback. An occasional double alert (in-app sound + notification while the screen dims) is acceptable to the owner; the notification is never dropped for that reason. The anti-goal "no push while on screen" is then best effort.

## Pieces

**Worker (`server/` folder in the same repo, TypeScript, deployed with wrangler):**
- `POST /subscribe { subscription }` → returns `{ id }` (random, stored on the device). Creates or refreshes the device's Durable Object.
- `POST /schedule { id, endsAt, title, body }` → stores one pending push, sets the alarm. Replaces any earlier one.
- `POST /cancel { id }` → deletes the pending push and alarm.
- `DELETE /subscribe { id }` → forgets the device (setting turned off).
- Alarm handler → sends Web Push (VAPID, aes128gcm payload) with `{ title, body, url: '#/trening' }`, then deletes the pending entry. On 404/410 from the push service, forget the subscription.
- CORS: only the app's origin (`https://repcak135.github.io`, plus `http://localhost:5173` for development).
- Basic abuse limits: body size cap, `endsAt` must be within the next 30 minutes, at most one pending push per device.

**App:**
- Ustawienia › Koniec przerwy: switch "Powiadomienie przy zablokowanym ekranie" + a short explanation of what leaves the phone. On: request permission → `pushManager.subscribe` with the VAPID public key → `/subscribe` → store `id` (device-only setting, never in backups). Off: `/subscribe` DELETE + unsubscribe.
- Rest hook (next to `RestBar`/`GlobalRest`): sends `/schedule` on hide and `/cancel` on show, only when the setting is on and a rest is running. Text: "Koniec przerwy" / "Seria N · Exercise name".
- Service worker: add push handling via `workbox.importScripts` (a small `public/push-sw.js`): `push` → `showNotification(title, { body, icon, tag: 'rest', data: { url } })`; `notificationclick` → focus the open app window or open `#/trening`.
- Server URL and VAPID public key as build-time config (`VITE_PUSH_URL`, `VITE_VAPID_PUBLIC_KEY`); when missing, the setting is hidden.

## Decided with the owner

- Order: push → ranking → backup.
- Only the "Koniec przerwy" notification; no countdown, no "until" notification.
- Opt-in, off by default.
- Durable Object alarm approach.
- Ranking/backup later will ask whether to join and what data to share.

## Claude's calls (owner can override)

- **Spike pass mark:** the owner locks the phone during 10 rests; `/schedule` must arrive at the Worker within 2 s every time (checked in the Worker logs). Fewer than 10/10 → fallback.
- **Spike setup:** the owner's Cloudflare account and a deployed `*.workers.dev` Worker exist before the spike (the owner creates the account; `wrangler login` once in their browser). A `workers.dev` address is fine as the public server URL.
- **Build config:** `VITE_PUSH_URL` and `VITE_VAPID_PUBLIC_KEY` are public values, committed in a small config file (or `.env.production`) so GitHub Actions builds them in. The VAPID private key is only a Cloudflare secret.
- **Who may call the Worker:** push endpoints are accepted only on known push-service hosts (`web.push.apple.com`, `fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`), so the Worker can never be used to POST elsewhere. The device `id` is a random 128-bit secret; every call needs it. Per-device limit: at most 60 `/schedule` calls per hour.
- **Friends:** everyone using the app uses the same Worker (owner's free plan). Free limits (100k Worker requests/day, Durable Object free tier) are far above a group of friends; no extra global limit for now.
- **Mount point:** the hide/show hook sits once at the app level (above `GlobalRest` and the workout screen), so it works on every screen.
- **Device-only fields:** the push `id` and the switch are added to `DEVICE_ONLY` in `backup.ts` and kept on restore, like `lastSeenVersion`.
- `pushsubscriptionchange` is handled by re-subscribing.

- Server code lives in `server/` of the same public repo; secrets only in Cloudflare.
- Notification text: title "Koniec przerwy", body "Seria 3 · Wyciskanie sztangi na ławce płaskiej" (next set of the current exercise; "Czas na kolejną serię" when unknown).
- The subscription `id` and the switch are device-only (not in backups, like `lastSeenVersion`).
- A version bump (0.9.x) and a changelog entry explaining the switch and what data leaves the phone.

## Left to the builder

- Web Push library for Workers (must run on Workers' Web Crypto; e.g. a small VAPID + aes128gcm implementation or a maintained Workers-compatible package).
- Exact Durable Object naming (one object per subscription id).
- Tests: unit tests for the Worker routes and alarm (Miniflare/vitest-pool-workers or plain unit tests with mocks), app unit tests for the hook, an e2e test of the setting UI with the server mocked.
- `wrangler.toml`, local dev, and a short `server/README.md` for deploying.
