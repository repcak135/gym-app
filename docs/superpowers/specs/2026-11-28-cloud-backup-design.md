# Cloud backup: design

Date: 2026-11-28. Status: approved by the owner on 2026-11-28 (R2 enabled; owner added a card, so free-tier limits must never be exceeded).
Part 3 of 3 of the server work (push and ranking are live). Reuses the nick + password accounts from the ranking (`docs/superpowers/specs/2026-11-27-ranking-design.md`).

## Why

Today a backup is a file the user must save by hand (share sheet → Pliki), with a reminder every 14 days. People forget, and a lost or broken phone loses training history. With accounts already in place, the app can back up on its own and restore on a new phone after login. The owner also wants to learn which exercises friends actually do, to choose the next ranking lifts, without reading anyone's training.

Success: after a workout the backup lands on the server by itself; on a new phone, log in → "Przywróć kopię z chmury" → everything is back. If a friend forgets the password and loses the phone, the owner gives Claude the nick and the backup can be recovered.

## Goals

- Opt-in "Kopia w chmurze" for logged-in users (Ustawienia › Kopia / Konto), off until switched on.
- Automatic upload after each finished workout, at most once per 10 minutes, retried on the next app start if offline. A manual "Wyślij kopię teraz".
- Server keeps the 3 newest backups per member.
- Restore on a new phone: log in → "Przywróć kopię z chmury" → preview (date, number of workouts, sets, measurements; same preview as the file restore) → "Przywróć". Uses the existing `parseBackup` / `restoreBackup`.
- End-to-end encrypted with a key unlocked by the user's password; the server stores only ciphertext.
- Admin recovery by nick (owner's requirement): a second lock on each backup's key, openable only with the admin private key that lives on the owner's PC.
- "Udostępnij anonimowo listę ćwiczeń": ON by default (owner's choice), visibly pre-checked on the enable screen and switchable in Ustawienia. Sends only exercise ids/names and set counts, without nick, account id, weights or dates.

## Non-goals

- Syncing between two phones at once (last upload wins; restore replaces local data, as the file restore does).
- A recovery code (replaced by admin recovery, owner's choice).
- Backing up device-only settings (they stay device-only, as in file backups).
- Photos (no photos exist yet).

## Anti-goals

- The server, or anyone with server access, able to read a backup. Only the user's password or the admin private key opens it.
- The admin private key in git, on the server, or in any Cloudflare secret.
- Silent data loss on restore. Restore always shows the preview and replaces only after confirmation, like the file restore.
- Running cost. Free plan only.

## Constraints

- Same Worker (`server/`), free plan; about 10 ms CPU per request, so all crypto runs on the phone or the owner's PC, never on the Worker.
- Cloudflare R2 for storage (owner chose it). It needs to be enabled in the dashboard by the owner. If Cloudflare asks for a payment card to enable R2, stop and ask the owner; the fallback is D1 with the backup split into ≤ 1 MB chunks.
- Backup JSON is the existing format from `backup.ts` (`BACKUP_FORMAT_VERSION`), so file and cloud backups stay one format.
- Polish UI, gender-neutral copy, version 0.9.x.

## Approaches considered (storage)

1. **R2 object storage** — chosen. One encrypted object per backup; 10 GB free; made for files of this size.
2. D1 (same DB as ranking): no new service, but ~2 MB per row means large histories (e.g. the owner's Gym Day import) need chunking.
3. Durable Object storage: size limits and hard to inspect.

## Encryption

- Per member: a random 256-bit backup key (BK), created on the phone when cloud backup is switched on.
- Each backup: AES-256-GCM with BK (random 96-bit IV), compressed first (e.g. `CompressionStream('gzip')`) if available.
- Lock 1, the password: BK wrapped with a key derived from the password, using the same PBKDF2 as login but with a separate salt/info, so the login key and the wrapping key differ. The server stores the wrapped BK.
- Lock 2, admin: BK wrapped with the **admin public key** built into the app (ECDH P-256 + HKDF + AES-GCM, or RSA-OAEP-3072; builder's choice, Web Crypto only). The server stores this wrapped BK too.
- The logged-in phone keeps BK locally (device-only, never in file backups).
- Password change: re-wrap BK with the new password key (the phone has BK); no re-upload of backups.
- "Zapomniałem hasła" on a logged-in phone: same re-wrap.
- New phone + password: download the wrapped BK, unwrap with the password, decrypt the newest backup.

## Admin recovery (by nick)

- The admin key pair is generated once on the owner's PC by `server/admin-keygen.mjs`. The public key goes into the app build config (public value). The private key is saved to `C:\Claude\gym-app-private\banana-admin-recovery.json`. That folder is never committed and is included in the weekly Drive backup; the file name must not match the Drive backup's skip patterns (`*.key`, `*.pem`). The keygen prints a reminder of where the key is.
- `node server/admin-recover.mjs <nick>`, using the admin token from the existing admin scripts:
  1. fetches the member's admin-wrapped BK;
  2. unwraps it locally with the private key;
  3. sets a random temporary password, as `admin-reset.mjs` does;
  4. re-wraps BK with the temporary password's key;
  5. uploads the new password-wrapped BK;
  6. sets `mustChange`;
  7. prints the temporary password once.
- The friend logs in with the temporary password, the backup opens, and the app forces a new password, which re-wraps BK.
- A nick is the only input; the script refuses unknown nicks and shows the member's last backup date for confirmation before changing anything.
- If the private key is ever lost, admin recovery stops working, but users' own passwords still work.

## Data on the server

- R2: `backups/<memberId>/<timestamp>.bin` (ciphertext), 3 newest kept.
- D1: per member `{ pwWrappedBK, adminWrappedBK, lastBackupAt, size }`.
- Anonymous exercise stats: a separate table with no member id: `{ exerciseId, name, sets }`. Each phone sends deltas since its last send; the server adds them up. No nick, no dates, no weights.

## Pieces

**Worker:** `PUT /backup` (body ≤ 10 MB, session token), `GET /backup/latest`, `GET /backup/list`, `POST /backup/keys` (store wrapped keys), `GET /backup/keys`, `POST /stats/exercises`. Admin: `GET /admin/backup-keys?nick=`, `POST /admin/backup-keys`. Limits per member: at most 20 uploads/day. Deleting the account (Opuść ranking / Usuń konto) also deletes the backups and keys.

**App:**
- Enable flow with the honest text: "Kopia jest zaszyfrowana Twoim hasłem. Właściciel aplikacji może ją odzyskać, jeśli zgubisz hasło." Includes the pre-checked "Udostępnij anonimowo listę ćwiczeń" with one line on what is sent.
- Automatic upload after `finishWorkout`, with the 10-minute debounce.
- Status line "Ostatnia kopia w chmurze: dziś 18:42" next to the file backup status.
- Restore entry on the login success screen and in Ustawienia.
- The 14-day file-backup reminder is not shown while cloud backup is on and recent.

## Decided with the owner

- Cloud backup encrypted with the password.
- An admin recovery lock for us, used by nick.
- Anonymous exercise list on by default.
- R2 storage.

## Claude's calls (owner can override)

- Upload after each workout (10-minute debounce) plus a manual button; 3 versions kept.
- Restore replaces local data after a preview, like the file restore.
- Admin private key only on the owner's PC + Drive backup; the public key in the app.
- No recovery code.
- Deleting the account deletes the cloud backups.

## Weekly mirror to the owner's Google Drive (owner's idea, 2026-11-28)

The Sunday Drive backup task also pulls a server snapshot before zipping. A script `server/admin-snapshot.mjs`, run with the admin token, saves everything into `C:\Claude\gym-app-private\server-snapshot\`:
- a D1 export (members, sessions, scores, wrapped keys, anonymous stats);
- all encrypted backup objects.

The encrypted backups stay unreadable there too. If Cloudflare ever loses or blocks the account, the server can be rebuilt from Drive. The task prompt (`~/.claude/scheduled-tasks/claude-backup-drive/SKILL.md`) gets one step that runs the snapshot before `backup_claude.py`. Keep the snapshot within the 15 MB per-file limit of the backup script (split if needed).

## Settled after the builder check (Claude's calls)

- **Password prompts:** "Włącz kopię w chmurze" always asks for the current password, because BK must be wrapped with it. The forced change after a temporary password re-wraps BK with the new password the user types. "Zmień hasło" already asks for the current one. "Zapomniałem hasła" on a logged-in phone uses the BK kept on the phone.
- **Atomic password change:** `POST /account/password` takes an optional `pwWrappedBK`. When the member has cloud keys, the server requires it and updates the login hash and the wrapped BK in one D1 batch. An old app (0.9.20–0.9.22) changing the password of a member with cloud keys gets "Zaktualizuj aplikację". Members without cloud keys keep working as before.
- **`admin-reset.mjs`** refuses members who have cloud keys and points to `admin-recover.mjs`, so BK is never orphaned.
- **New phone:** at login, if the member has cloud keys, the app unwraps BK with the typed password and stores it on the phone (device-only). Cloud backup is then on for that phone.
- **Anonymous stats:** built-in catalogue exercises only; custom exercises are skipped, because their names are free text. Counted: completed working sets (no warm-ups). Each phone sends deltas against a baseline it keeps on the device; after a restore or login, the baseline is set to the current totals, so history is never sent twice.
- **Restore screen:** shows the cloud counts and this phone's counts side by side. If this phone has workouts newer than the cloud backup, it warns: "Na tym telefonie są nowsze treningi, które przepadną." Restore happens only after confirmation.
- **Admin key lifecycle:** every wrapped key carries `{ v: 1, kid }`, so the key can be rotated later. `admin-keygen.mjs` refuses to overwrite an existing key file.
- **Transport:** `PUT /backup` takes a binary body (`application/octet-stream`), with its own 10 MB cap, separate from the JSON `MAX_BODY`. The builder measures the owner-size history (the Gym Day import fixture) after compression; if it comes close to the cap, the cap is raised within R2 limits. Uploads are limited to 20 per member per day, counted in D1 like login attempts. Only the 3 newest backups are kept.
- **R2 setup:** bucket `banana-gym-backups`, bound in `wrangler.toml`. Tests use a fake R2, as D1 runs on `node:sqlite`.
- **Device-only fields** (added to `DEVICE_ONLY` in `backup.ts` and to `CLAUDE.md`): BK, the cloud-on flag, the last upload time, the stats baseline, and the stats-sharing switch.

## Staying inside R2's free tier (owner's condition, 2026-11-28)

R2 is enabled on the owner's account with a payment card on file. Usage above the free tier (10 GB-month storage, 1 M Class A / 10 M Class B operations per month) would be billed, so the Worker enforces hard caps well below it:
- per member: at most 3 objects and 30 MB in total;
- global: the Worker keeps a running total in D1 and refuses uploads once stored backups reach 5 GB;
- at most 20 uploads per member per day, plus a global cap of 20 000 uploads per month (Class A);
- at most 2 000 downloads per member per month (Class B).

When a cap is hit, the upload is refused with a clear Polish message, and the app keeps the local copy and the file backup. `server/README.md` documents how to check R2 usage, and the owner is asked to set a Cloudflare billing notification at 0.01 USD.

## Left to the builder

- Exact wrapping scheme (ECDH vs RSA-OAEP) within Web Crypto, and Node's `crypto.webcrypto` for the scripts.
- Compression choice and the fallback when `CompressionStream` is missing.
- Tests:
  - crypto round trips (password lock, admin lock, password change, admin recovery);
  - Worker routes and limits;
  - restore from the cloud with the server mocked (e2e);
  - the anonymous stats contain no member id.
