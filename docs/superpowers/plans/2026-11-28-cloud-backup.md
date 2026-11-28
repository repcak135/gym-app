# Cloud backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opt-in, end-to-end encrypted cloud backup for ranking accounts, with admin recovery by nick, an anonymous exercise list, and hard caps inside R2's free tier.

**Architecture:** The phone gzips and AES-GCM-encrypts the existing `backup.ts` JSON with a per-member backup key (BK) and uploads the ciphertext to R2 through the Worker. BK is stored on the server twice, wrapped: with a PBKDF2 key from the password (own salt, so it differs from the login key) and with the admin ECDH P-256 public key built into the app. D1 holds the wrapped keys, an index of objects (for caps and retention), counters and the anonymous exercise totals. The Worker never decrypts anything.

**Tech Stack:** Cloudflare Workers + D1 + R2 (free), Web Crypto (`CompressionStream`, PBKDF2, AES-GCM, ECDH, HKDF); Node `crypto.webcrypto` for the admin scripts; React 19, Dexie; Vitest (D1 on `node:sqlite`, fake R2), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-28-cloud-backup-design.md`

## Global Constraints

- Never billable: per member ≤ 3 objects and ≤ 30 MB; global stored ≤ 5 GB; ≤ 20 uploads per member per day; ≤ 20 000 uploads per month globally; ≤ 2 000 downloads per member per month. Upload body ≤ 10 MB (`application/octet-stream`).
- The server stores only ciphertext and wrapped keys. The admin private key lives only in `C:\Claude\gym-app-private\banana-admin-recovery.json`.
- Wrapped keys are JSON strings with `{ v: 1, kid, ... }`. Password lock: PBKDF2-SHA-256 (300 000 iterations, its own 16-byte salt) → AES-GCM. Admin lock: ephemeral ECDH P-256 + HKDF-SHA-256 (`info = "banana-admin-wrap-v1"`) → AES-GCM.
- Backup object: `"BGB1"` ‖ flags (bit 0 = gzip) ‖ 12-byte IV ‖ AES-256-GCM ciphertext, AAD `"banana-backup-v1"`.
- Device-only settings: `cloudKey`, `cloudOn`, `cloudLastAt`, `cloudShareStats`, `cloudFingerprint` (+ the stats baseline in `localStorage`).
- Anonymous stats: built-in exercises only (`custom` skipped), completed working sets, deltas against a device baseline; no member id stored.
- `POST /account/password` requires `pwWrapped` for members with cloud keys (old apps get 409 → "Zaktualizuj aplikację"); `admin-reset.mjs` refuses them.
- Polish, gender-neutral copy; version 0.9.23.

## Review Focus

1. A second phone switches cloud backup on while the first already has it → it must adopt the existing BK (unwrap with the password), never create a new one.
2. Wrong password typed when switching on → refused before anything is wrapped.
3. Restore when this phone has newer workouts → warning shown; nothing replaced without "Przywróć".
4. Cap reached (daily, monthly, storage) → Polish message; local data and file backup untouched.
5. Password change on a phone without BK for a member with cloud keys → clear message, login hash unchanged.

---

### Task 1: D1 + R2 + Worker routes (`server/src/cloud.ts`, migration `0003_cloud_backup.sql`)

- [ ] Tables `backup_keys(member_id PK, pw_wrapped, admin_wrapped, updated_at)`, `backups(object_key PK, member_id, created_at, size)`, `counters(key PK, n)`, `exercise_stats(exercise_id PK, name, sets)`.
- [ ] Routes: `PUT /backup`, `GET /backup/latest`, `GET /backup/list`, `DELETE /backup`, `POST /backup/keys`, `GET /backup/keys`, `POST /stats/exercises`; admin `GET /admin/backup-keys?nick=`, `POST /admin/backup-keys`, `GET /admin/snapshot`, `GET /admin/backup-object?key=`.
- [ ] Account changes: password route takes `pwWrapped`; leave/remove delete objects; admin reset refuses members with keys.
- [ ] Tests (fake R2): caps (3 objects kept, 20/day, monthly, 5 GB, 2 000 downloads), keys round trip, stats sums with no member id, deletes, old-app password change → 409.

### Task 2: Admin scripts

- [ ] `admin-keygen.mjs` (refuses to overwrite), `admin-recover.mjs <nick>` (confirm with last backup date, unwrap, temp password, rewrap, `mustChange`), `admin-snapshot.mjs` (D1 JSON + objects into `gym-app-private\server-snapshot\`, files split ≤ 14 MB). Snapshot step added to the Drive task.

### Task 3: App crypto and sync (`src/cloud/`)

- [ ] `crypto.ts`: BK, encrypt/decrypt object, password wrap/unwrap, admin wrap; tests incl. admin recovery end to end through `admin-lib.mjs`.
- [ ] `cloud.ts`: enable (adopt existing BK), upload, restore download, stats deltas, password re-wrap; `CloudSync` (10-minute debounce, retry on start).

### Task 4: Screens

- [ ] Ustawienia › Kopia w chmurze (`/ustawienia/chmura`): honest text, password, pre-checked anonymous list, status "Ostatnia kopia w chmurze", "Wyślij kopię teraz", restore preview with cloud vs phone counts and the newer-workouts warning, switch off.
- [ ] Login unwraps BK; forced/normal password change re-wraps; 14-day reminder hidden while cloud is on and recent.
- [ ] e2e `e2e/cloud.spec.ts` with the server mocked.

### Task 5: Release

- [ ] Security pass before release; deploy Worker; 0.9.23 + changelog; CLAUDE.md; owner: billing alert 0.01 USD and switch on.
