# Friends' ranking and accounts: design

Date: 2026-11-27. Status: approved by the owner on 2026-11-27; bench table changed to all-time on 2026-11-28 (owner: "Ranking tydzień miesiąc miał być tylko dla ilości treningów, a ranking największego wyciśnięcia powinien być all time"), shipped in 0.9.21.
Part 2 of 3 of the server work (push is done, cloud backup comes next). The accounts built here are reused by the cloud backup.

## Why

The owner and friends want a light competition: who trains most often, and who presses the most for their size. It should motivate without exposing private data. Accounts (nick + password) are also needed so a backup can later be pulled from the cloud onto a new phone.

Success: friends join with a nick, see two tables (workouts per week/month, bench points), the tables update after each finished workout, and someone on a new phone logs in with nick + password and is the same person.

## Goals

- Opt-in "Ranking" screen (in Statystyki) with a join flow: unique nick, password, sex (for points), and a choice of what to share: workouts per week/month and/or bench points.
- One global group for everyone who joins (owner's choice).
- Table 1, "Treningi": finished workouts in the current week / month. The Tydzień | Miesiąc switch applies only to this table.
- Table 2, "Ławka (DOTS) · rekord wszech czasów": **all-time** best DOTS points from an **actually lifted** weight in a completed working set with at least 1 rep, ever. No period switch. No estimated 1RM (owner's rule). Warm-ups and 0-rep sets do not count.
- Points are computed on the phone from that weight, the body weight on the day of the lift (Statystyki › Ciało: the latest entry on or before that day, else the earliest entry after it) and sex. Only the points go to the server.
- Automatic update after each finished workout.
- Login on another phone with nick + password. Change password in the app. Leave ranking = delete my data on the server.
- Admin password reset by the owner/Claude from the computer, for a friend who forgot it.

## Non-goals

- Email, password-reset emails, social login.
- Invite-code groups (owner chose one group).
- Exercises other than the bench for now (added later from shared backups).
- Anti-cheat (a group of friends).
- Cloud backup (next design; it reuses these accounts).

## Anti-goals

- Body weight, sex, weights lifted or workout details stored on the server.
- The password readable by anyone, including the owner and Claude.
- Joining by default or without an explicit choice of shared data.
- Any running cost.

## Constraints

- Same Cloudflare Worker as push (`server/`), free plan. Free Workers have about 10 ms CPU per request, so heavy password hashing cannot run on the server.
- The app is static on GitHub Pages; the server URL comes from the same build config as push.
- Public AGPL repo: admin token and any secret only in Cloudflare secrets.
- Polish UI, gender-neutral copy, versions stay 0.9.x.

## Approaches considered (storage)

1. **Cloudflare D1 (SQLite)** — chosen. Tables `members` and `scores`; ranking = one query; easy to inspect and fix with `wrangler d1 execute`.
2. One global Durable Object holding the ranking — same tech as push, but harder to inspect or fix.
3. Workers KV — eventually consistent (new scores visible to others up to ~60 s later) and no sorting.

## Accounts and passwords

- Nick: 3–20 characters (letters, digits, `_`, `-`, Polish letters allowed), unique ignoring case.
- Password: at least 8 characters. The phone derives a key with PBKDF2-SHA-256 (high iteration count, salt = normalized nick + fixed app string) and sends only that. The server stores `SHA-256(serverSalt + derived)` with a per-member random salt. Login compares in constant time. The plain password never leaves the phone.
- After join or login the server returns a random session token (128-bit) stored on the device. All score updates use it. The token stays on the device only (not in backups); a new phone logs in with nick + password.
- Login attempts: at most 5 failed per nick per 15 minutes, and a per-IP limit.
- Change password in the app (Ustawienia › Konto): current password + new one. On a logged-in phone, "Zapomniałem hasła" lets you set a new one without the old one, because the session token proves ownership.
- Admin reset: a script `server/admin-reset.mjs <nick>`, protected by an admin token stored only as a Cloudflare secret. It sets a random temporary password, prints it once, and makes the member change it on next login. The owner hands it over in person or by message.

## Data sent to the server

- Join: nick, password-derived key, chosen sharing flags.
- After each finished workout: `{ week: 'YYYY-Www', month: 'YYYY-MM', workoutsWeek, workoutsMonth, benchBest? }`, only for the sharing options that are on. Everything is recomputed on the phone and replaces the stored values (`benchBest` = all-time best DOTS).
- Never: body weight, sex, kilograms, exercise lists, notes.

## Pieces

**Worker:**
- `POST /account/join`, `POST /account/login`, `POST /account/password`, `DELETE /account` (leave + delete all rows), `POST /scores`, `GET /ranking?period=week|month`.
- D1 schema with migrations in `server/migrations/`.
- Admin: `POST /admin/reset` with the admin token; `server/admin-reset.mjs` wraps it.
- CORS as for push; body size caps; rate limits.

**App:**
- Statystyki › "Ranking" card/screen: join form, the two tables with a Tydzień | Miesiąc switch, your row highlighted, "↑ x" change since the last view.
- Ustawienia › Konto: nick, what is shared (editable), change password, log out, leave ranking.
- DOTS formula in `src/data/dots.ts` (official male and female polynomials), unit-tested against published reference values.
- Score sync after `finishWorkout`, plus a retry on the next app start if offline.
- The session token is device-only (see below); sex and the sharing choices are in settings.

## Decided with the owner

- What is ranked: workouts per week and month, plus points from chosen exercises (bench first).
- Points from lifted weight, body weight and sex (DOTS), computed from **real lifts with at least 1 rep**, never estimates.
- One group for everyone.
- D1 storage.
- Nick + password accounts, no email; admin reset by the owner; a password change in the app.
- Opt-in with a choice of what is shared.

## Claude's calls (owner can override)

- DOTS rather than IPF GL (one formula for every lift, so future exercises fit).
- Body weight from the latest Ciało entry; the app asks for it if there is none; sex is asked once at join (Mężczyzna / Kobieta).
- Week = Monday–Sunday, local time.
- Nick shown exactly as typed; uniqueness ignores case.

## Settled after the builder check (Claude's calls)

- **Which bench counts:** the classic flat barbell bench only (the catalogue's flat barbell bench press ids, including merged duplicates and the wide / close-grip flat barbell variants); not dumbbell, incline or Smith. This keeps the table fair. The server schema is keyed by an exercise key (`bench` now, more later), so new lifts need no schema change.
- **Weight:** the stored set weight (total on the bar), any completed working set with >= 1 rep ever, regardless of reps (100x1 beats 80x12, per the owner's rule). Each set gets the body weight of its day and the best DOTS points win, so a lighter lift at a lower body weight can beat a heavier one. No unit conversion (kg only).
- **Body weight:** the Ciało entry of the lift day (latest on or before it, else the earliest after it). If there is no body weight at all, the join form asks for the current one (saved in Ciało); until then only workouts are shared.
- **Periods:** workouts have one row per member per period key (`2026-W48`, `2026-11`) in `scores`; rows older than 3 months are deleted. The bench has one all-time row per member and exercise in `records` (`bench` now, more lifts later; migration `0002` dropped the per-period bench rows). A member sharing workouts shows 0 when they have none this period. A member who shares only one table appears only in that table.
- **Resync triggers:** finishing, editing or deleting a workout, restoring a backup, a new Ciało weight, and app start if a previous send failed. The phone always sends its current truth, so an edit can lower a score (intended).
- **Session token is NOT in the backup file.** Backups may be shared with friends or analysed later, and a token in them would hand over the account. On a new phone you log in with nick + password (that is what the password is for). Sessions live in their own table (several per member); a password change ends all other sessions; "Wyloguj" ends this one.
- **Password scheme:** the client salt is a random per-member value the server hands out (`GET /account/salt?nick=`), not derived from the nick, so a nick rename stays possible later. The PBKDF2 iteration count is stored per member (versioned) so it can be raised. Admin reset (`server/admin-reset.mjs`) runs the same client-side derivation, sets a `mustChange` flag, and prints the temporary password once.
- **"Zapomniałem hasła" on a logged-in phone** needs only the session token. Accepted, because the token never leaves the phone.
- **Rate limits** persist in D1 (failed logins per nick and per IP, 5 per 15 min per nick). A friend locking someone's nick for 15 minutes is an accepted risk.
- **"↑ x" since the last view** is computed on the phone from the last ranking it saw.
- **Infrastructure:** Claude creates the D1 database from this PC (wrangler is already logged in); its id in `wrangler.toml` is not a secret. The Worker is deployed before the app release, so the app never calls missing routes.

## Owner's decision on joining (2026-11-27)

Open join: anyone with the app can join the one group, protected only by per-IP limits. A join code or owner approval may come later, so keep the join endpoint easy to extend (e.g. an optional `code` field the server can start requiring). Admin can delete a member with the admin script (`server/admin-remove.mjs <nick>`).

## Left to the builder

- Exact PBKDF2 iteration count (fast enough on an older iPhone, < ~1 s).
- UI details within the existing design system.
- Tests: Worker route tests (join/login/limits/delete/admin), DOTS unit tests, sync logic tests, e2e for join/leave with the server mocked.
