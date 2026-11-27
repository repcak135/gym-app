# Banana Gym: project guide for Claude

Read this first when you come back to this project after a long break. **Update it with every release** (the "State" section, plus any new rule or decision). Detailed history is in `docs/` and `src/data/changelog.ts`.

## What this is

A private gym-training app for the owner and their friends, on iPhone and Android. It is a free alternative to a paid app (Gym Day) that kept freezing.

- Installable web app (PWA). All data lives in IndexedDB on each phone. No account and no cost. The only server is the optional rest-end push Worker (`server/`, Cloudflare free plan), which holds no workout data.
- Live at https://repcak135.github.io/gym-app/. Every push to `main` deploys through GitHub Actions (`npm ci`, then vitest, then build with `VITE_BASE=/gym-app/`).
- The repo is public (repcak135/gym-app, AGPL-3.0, because openGym catalogue text is reused). `NOTICE` credits openGym and free-exercise-db.
- The UI is Polish only. The English version is postponed; it was a token-cost decision.

## Stack

React 19 + TypeScript + Vite, `vite-plugin-pwa` (Workbox autoUpdate), HashRouter, Dexie (`src/data/db.ts`), lucide-react, Vitest + fake-indexeddb + jsdom, Playwright.

Lazy-loaded: ExcelJS (report), `qr-scanner`, and the openGym catalogue chunk. The body map uses MIT polygons from react-body-highlighter.

## Commands

- `npm run dev`: preview config "gym-app" in `C:\Claude\.claude\launch.json`, port 5173.
- `npx vitest run`: unit tests, 420+.
- `npm run build`: runs `tsc -b`, then vite.
- `npx playwright test`: e2e tests.
  - The `mobile` project has an explicit `testMatch` list in `playwright.config.ts`. **A new spec must be added there.**
  - Playwright reuses any server already running on :5173.
  - Known flaky e2e tests under load: `exercises.spec` (scroll), `polish.spec` (swipe). They fail on an untouched main too.

## Release rules (always)

1. Version stays **0.9.x**; the owner does not want 1.0 yet. Bump `package.json` (and `src/version.ts` if it is separate) on every user-visible release.
2. Add a Polish, user-friendly entry to `src/data/changelog.ts`. The "Co nowego" sheet shows it once per device (`lastSeenVersion`, device-only setting).
3. Commit as repcak135 with the GitHub noreply address, push to `main`, and confirm the Actions run ends `completed success`.
4. Tell the owner to close and reopen the app twice to get the update.
5. Update the "State" section below.

## Data rules (do not break)

- **Never lose user data.** Schema changes need a new `this.version(n)` in `db.ts`. Never change old versions.
- **Backup** (`src/data/backup.ts`) must include every table and every user-set field.
  - Today it covers: plans, workouts, sets, notes, aliases, body, custom exercises, per-exercise overrides (weightStep, barWeight, measureOverride, userNames), the settings that travel between devices, and the colour theme (top-level `theme`, which lives in localStorage).
  - Device-only fields stay out of the backup: `exerciseDbVersion`, `lastBackupAt`, `backupReminderSnoozedUntil`, `lastSeenVersion`, `restPush`, `pushId`, `pushPromptDone`.
  - A new field means a round-trip test in `backup.test.ts`.
- **The built-in catalogue is re-seeded when `EXERCISE_DB_VERSION`** (in `src/data/exercises.ts`) **is bumped.** User fields such as `userNames` are kept. Bump it when catalogue data changes: names, Polish names, muscles, measures.
- **Plan-change suggestions** use the intended counts `WorkoutExercise.sets`/`warmupSets`, not the completed sets, so finishing a workout early never shrinks the plan.
- **Progression** is per-set "dynamic double progression" (`src/data/setTargets.ts`): +1 rep per set toward the top of the range. At the top, the set gets +weight step and restarts at the bottom of the range. Rep drop-off between sets is not equalized. RPE is stored as RIR and read relative to the "Jak ciężko trenujesz?" effort setting. Explanations are written in plain language for beginners.

## Exercise catalogue

- **Sources:**
  - free-exercise-db (Unlicense): `exercise-db.json`
  - our extras with `x-` ids: `exercises-extra.json`
  - openGym catalogue text (AGPL): `exercises-og.json`, holding `added`, `polishNames`, `aliases` and `merged` (duplicate → kept id)
- **Never use openGym's images or video, nor MuscleWiki content.**
- **Polish:**
  - names: `exercises-og.json` `polishNames` → `Exercise.name` (English kept in `nameEn`)
  - instructions: `instructions-pl.json`, applied only when the step count matches
  - tips: `tips-pl.json`
  - gym slang: `exercise-aka.json`, plus `SLANG` in `exercises.ts`
- **Shoulder heads:** `deltHeads.ts` + `delt-overrides.json`.
- **Timed and distance exercises:** `exercise-measure.json`.

## Platform limits (already researched; do not retry)

- Rest end while the phone is locked: solved with server push (0.9.17, `server/`). A lock-screen countdown stays impossible. iOS plays the beep through the silent switch via `navigator.audioSession`. Android has the experimental "Graj w tle" option.
- iOS: the installed PWA has storage separate from Safari. QR codes must be scanned with the in-app scanner, not the system camera.
- iOS 26 viewport bug: fixed with `html{min-height:calc(100% + env(safe-area-inset-top))}` plus a floating pill nav.
- Native iOS app: rejected for good. Sideloading needs re-signing every 7 days and the paid account costs money.
- Gym Day share links contain no plan data and its API is private, so importing from them is impossible. Gym Day **CSV** import works (`csvImport.ts`).
- No Azure: it is not free for the owner. Any future server goes on Cloudflare Workers Free (D1 + Durable Objects).

## Private files: never commit

- `C:\Claude\gym-app-private\`: the owner's book digest (copyrighted PDF, "Fundamenty Treningu Siłowego"), page renders, branding sketches and ChatGPT images.
- The owner's Gym Day CSV export (in `.gitignore`).
- Template plans use our own wording, inspired by the book; never copy its text.

## How we work

- The owner is a "vibe coder": they judge results visually and talk in Polish. Show results, not diffs. They check Claude; Claude checks the helpers.
- Delegation ladder (see `~/.claude/CLAUDE.md`):
  1. Antigravity (`agy`), launched from the PowerShell tool through `~/.claude/scripts/run-agy.sh`;
  2. Claude helpers: `pomocnik` (Haiku), `wykonawca` (Sonnet);
  3. the main session verifies.
- Keep the main session's context small. Big pieces go to separate sessions; two writers never touch the same files.
- Friends send feedback as screenshots. Most use Android; the owner uses an iPhone.

## Backups of the source

- GitHub: `main` on repcak135/gym-app. Always pushed after a commit.
- Google Drive: the weekly scheduled task `claude-backup-drive` (Sundays 20:00, only while the desktop app is open) zips `C:\Claude` (including this repo and `gym-app-private`) into the Drive folder "Claude backup". Build output (`dist`, `test-results`) is skipped.

## State (update on every release)

- **Current version: 0.9.18** (2026-11-27), catalogue `EXERCISE_DB_VERSION` 8.
- **Push on by default (0.9.18, owner's wish):** browsers allow the permission prompt only after a tap, so `src/push/PushPrompt.tsx` asks once on the workout screen, only in the installed app: "Powiadomienie o końcu przerwy?" Włącz / Nie teraz. The answer is the device-only `pushPromptDone`.
- **Rest-end push (0.9.17):** opt-in switch "Powiadomienie przy zablokowanym ekranie" (Ustawienia › Koniec przerwy, off by default). `src/push/RestPush.tsx` (mounted once in App) sends `/schedule` with `keepalive` on hide/pagehide while a rest runs and `/cancel` on show; `public/push-sw.js` is imported into the Workbox SW (`workbox.importScripts`) and shows the notification. Worker in `server/` (see its README): one SQLite Durable Object per device id, alarm at `endsAt`, own VAPID + aes128gcm code, push-host allowlist, CORS for the app only. Live at https://banana-gym-push.banana-gym-push.workers.dev on the owner's Cloudflare account (wrangler logged in on this PC). Public config in `.env`; the VAPID private key is only a Cloudflare secret (a copy in `gym-app-private\vapid-private.json`, never commit). `restPush`/`pushId` are device-only (not in backups). Spike 2026-11-27: 7/7 locks on the owner's iPhone delivered `/schedule` within 0.41 s, so the hide/show design shipped (no fallback).
- **0.9.10–0.9.14 (owner's gym feedback):** sets start as last time, the progression target is only a suggestion with a "Zastosuj" button (never auto-applied); iPhone audio uses the 'ambient' session and no audio at all when the preset is silent (it paused Spotify), 'playback' only with "Graj przy wyciszonym iPhonie"; `GlobalRest` shows the rest bar on every screen and a green "Koniec przerwy +m:ss" bar (`restEndedAt`) until the next set; `CrashScreen` + an index.html fallback replace blank screens; a 0-wide pager while hidden saved `currentIndex = NaN` and crashed the workout (guarded in 3 places).
- **Lesson:** iPhone web apps cannot vibrate and cannot show a lock-screen timer (owner declined the Shortcuts workaround: too many taps).
- **Exercise names (0.9.9):** a built-in exercise's `name` is Polish when one exists; the English original is in `nameEn` (shown smaller underneath, searchable, matched by the CSV import). Swapped in `fromDb` after delts/measure/aka, which key on the English name. e2e specs use the Polish names.
- **Done:** plans, live workout, history, stats + body map, body measurements, backup/restore (including the theme), plan and exercise sharing (link/QR), Excel report, Gym Day CSV import, motivation (weekly goal, streak, badges, yearly calendar), per-set progression, supersets (one rest per round, set on the last item), timed and distance exercises, warm-up generator ("Dobierz rozgrzewkę"), templates, shoulder heads, colour themes, gym slang search, consistency audits, gender-neutral wording.
- **Polish content:** every catalogue exercise has a Polish name and Polish instructions. Tips: 482 exercises (the popular strength ones). Olympic lifts use Polish terms: zarzut = clean, wybicie = jerk, rwanie = snatch, podrzut = clean and jerk.
- **Copy rule:** gender-neutral Polish. Use imperatives or impersonal forms, never "zrobiłeś", "dałbyś", "gotowy".
- **Open, waiting on the owner:** private body progress photos (deferred; remind them); a Cloudflare server for ranking and cloud backup (next designs, each with an opt-in and a choice of shared data; push is done); a nicer address such as banana-gym.pages.dev (postponed; a move means reinstall + backup/restore for everyone, so do it once, with a notice on the old URL); English version.
