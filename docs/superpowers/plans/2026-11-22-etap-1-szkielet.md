# Etap 1: Szkielet aplikacji — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installable, offline-capable dark-theme PWA shell with a bottom nav of five empty Polish-titled screens and the full local data layer that later stages build on.

**Architecture:** Vite + React SPA with HashRouter (works on any static host and subpath). All persistence goes through one module, `src/data/`, built on Dexie (IndexedDB), so a sync layer can be added later. `vite-plugin-pwa` generates the manifest and a Workbox service worker that precaches the app shell.

**Tech Stack:** React 19, TypeScript (strict), Vite, react-router (HashRouter), Dexie 4, vite-plugin-pwa (+ @vite-pwa/assets-generator), lucide-react, Vitest + fake-indexeddb + @testing-library/react, Playwright (Chromium, mobile viewport). Latest stable versions at install time.

**Spec:** `docs/superpowers/specs/2026-11-22-gym-app-design.md`

**Execution notes (this project):** Code is written by Sonnet 4.6 via `agy-delegate --model claude-sonnet-4-6 --mode accept-edits --timeout 10m --dir C:/Claude/gym-app` with "do not run shell commands". The main session runs every shell command (npm install, tests, build, git) and verifies each task before the next.

## Global Constraints

- Cost 0 zł: only free, open-licensed libraries; no paid services.
- UI language Polish; exercise names stay English.
- Dark theme only; own look (not modelled on the owner's current app).
- Large touch targets (≥ 44 px), one-handed use, numbers in `font-variant-numeric: tabular-nums`.
- Data lives only on the device (IndexedDB); no server, no login.
- No fonts or assets from external CDNs at runtime (must work offline in the gym); system font stack.
- The owner's real export `gym-day.csv` never enters the repo (`.gitignore` it).
- Bottom nav, in order: Start, Plany, Ćwiczenia, Historia, Statystyki.

## Review Focus

1. iPhone notch / home indicator covering the bottom nav → nav must pad with `env(safe-area-inset-bottom)`; `index.html` has `viewport-fit=cover`. (Task 1 test)
2. Opening a deep link or reloading on a non-root screen on a static host must not 404 → HashRouter; `/#/historia` loads Historia directly. (Task 1 test)
3. No signal in the gym: after one online visit the app must load offline. (Task 3 test)
4. Data must survive reloads and app updates; the browser is asked for persistent storage once at startup. (Task 2 tests)
5. Tap targets too small for sweaty thumbs → every nav item ≥ 44 px tall. (Task 1 test)

---

### Task 1: Project scaffold, dark theme, bottom nav, five screens

**Files:**
- Create (main session, via `npm create vite@latest . -- --template react-ts`): `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `src/main.tsx`
- Create: `.gitignore` (add `gym-day.csv`, `*.csv` except `tests/fixtures/*.csv`, `node_modules`, `dist`, `playwright-report`, `test-results`)
- Create: `src/theme/tokens.css`, `src/theme/global.css`
- Create: `src/App.tsx`, `src/components/BottomNav.tsx`, `src/components/BottomNav.css`
- Create: `src/pages/StartPage.tsx`, `PlansPage.tsx`, `ExercisesPage.tsx`, `HistoryPage.tsx`, `StatsPage.tsx`
- Create: `playwright.config.ts`, `e2e/shell.spec.ts`

**Interfaces:**
- Produces: routes `/` (Start), `/plany`, `/cwiczenia`, `/historia`, `/statystyki` under `HashRouter`; each page renders an `<h1>` with its Polish title. `BottomNav` with `nav[aria-label="Główne menu"]`, links with visible labels "Start", "Plany", "Ćwiczenia", "Historia", "Statystyki", active link has `aria-current="page"`.
- Produces: CSS custom properties in `tokens.css` (used by every later stage): `--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--accent` (primary actions), `--success` (completed sets), `--danger`, `--radius`, `--nav-height`, `--space-1..6`.
- `vite.config.ts`: `base` from `process.env.VITE_BASE ?? '/'`.

Design direction (Claude's call, builder fills in): near-black blue-grey background, slightly lighter cards, one saturated accent colour for primary actions and a distinct green for "done"; system font stack; pages scroll above a fixed bottom nav with icons from lucide-react (`Home`, `CalendarDays`, `Dumbbell`, `History`, `ChartLine`) and labels.

- [ ] **Step 1: Scaffold** (main session): `npm create vite@latest . -- --template react-ts`, then `npm i react-router lucide-react` and `npm i -D @playwright/test vitest`, `npx playwright install chromium`. Remove Vite demo files/CSS.
- [ ] **Step 2: Write the failing e2e test** `e2e/shell.spec.ts` (Playwright project uses `devices['iPhone 13']` viewport with Chromium; `webServer` runs `npm run dev`):

```ts
test('każda zakładka pokazuje swój ekran', async ({ page }) => {
  await page.goto('/');
  for (const [label, title] of [['Plany','Plany'],['Ćwiczenia','Ćwiczenia'],['Historia','Historia'],['Statystyki','Statystyki'],['Start','Start']]) {
    await page.getByRole('navigation', { name: 'Główne menu' }).getByRole('link', { name: label }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
  }
});
test('link bezpośredni działa po przeładowaniu', async ({ page }) => {
  await page.goto('/#/historia'); await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Historia');
});
test('przyciski menu mają co najmniej 44 px', async ({ page }) => {
  await page.goto('/');
  for (const link of await page.getByRole('navigation', { name: 'Główne menu' }).getByRole('link').all())
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
test('menu uwzględnia bezpieczny obszar iPhone', async ({ page }) => {
  await page.goto('/');
  expect(await page.locator('meta[name=viewport]').getAttribute('content')).toContain('viewport-fit=cover');
  const css = await page.evaluate(() => [...document.styleSheets].flatMap(s => [...s.cssRules].map(r => r.cssText)).join('\n'));
  expect(css).toContain('safe-area-inset-bottom');
});
```

- [ ] **Step 3: Run** `npx playwright test e2e/shell.spec.ts` → FAIL (no nav).
- [ ] **Step 4: Implement** tokens, global styles, `App` with `HashRouter` + layout, `BottomNav`, five pages (each just `<h1>` + short muted placeholder line, e.g. "Tu pojawią się Twoje plany."). `<html lang="pl">`, `<meta name="theme-color">` = `--bg` value.
- [ ] **Step 5: Run** `npx playwright test` → 4 passed; `npm run build` → no TS errors.
- [ ] **Step 6: Verify visually** (main session): screenshot at 390×844 of Start and Historia; check contrast and nav look.
- [ ] **Step 7: Commit** `feat: app shell with dark theme and bottom nav`

### Task 2: Data layer (types, Dexie schema, settings, persistent storage)

**Files:**
- Create: `src/data/types.ts`, `src/data/db.ts`, `src/data/settings.ts`, `src/data/storage.ts`
- Create: `src/data/db.test.ts`, `src/data/settings.test.ts`, `src/data/storage.test.ts`, `vitest.config.ts` (environment `jsdom`, setup file imports `fake-indexeddb/auto`)
- Modify: `src/main.tsx` (call `requestPersistentStorage()` once on startup)

**Interfaces (Produces — every later stage uses these exact names):**

```ts
// types.ts
export type Id = string;                       // crypto.randomUUID()
export interface Exercise { id: Id; name: string; primaryMuscles: string[]; secondaryMuscles: string[];
  equipment: string | null; category: string; level?: string; instructions: string[]; images: string[];
  custom: boolean; weightStep?: number; barWeight?: number }
export interface ExerciseNote { exerciseId: Id; text: string; updatedAt: number }
export interface PlanItem { exerciseId: Id; sets: number; warmupSets: number; repsMin: number; repsMax: number; restSec: number }
export interface PlanDay { id: Id; name: string; items: PlanItem[] }
export interface Plan { id: Id; name: string; startedAt: string /* YYYY-MM-DD */; days: PlanDay[] }
export interface Workout { id: Id; name: string; startedAt: number; endedAt?: number; planId?: Id; dayId?: Id;
  source: 'app' | 'import'; importKey?: string }
export interface WorkoutSet { id: Id; workoutId: Id; exerciseId: Id; exerciseOrder: number; setOrder: number;
  weight: number; reps: number; warmup: boolean; completedAt?: number }
export interface ExerciseAlias { sourceName: string; exerciseId: Id }
export interface AppSettings { key: 'app'; activePlanId?: Id; barWeight: number; plates: number[];
  defaultWeightStep: number; lastBackupAt?: number }
```

- `db.ts`: `export const db` — Dexie database `'gym-app'`, version 1, tables and indexes:
  `exercises: 'id, name'`, `notes: 'exerciseId'`, `plans: 'id'`, `workouts: 'id, startedAt, importKey'`,
  `sets: 'id, workoutId, exerciseId, [exerciseId+workoutId]'`, `settings: 'key'`, `aliases: 'sourceName'`.
  (Booleans are not valid IndexedDB keys, so `custom` stays unindexed; filter in memory — ~900 rows.)
- `settings.ts`: `export const DEFAULT_SETTINGS: AppSettings = { key: 'app', barWeight: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], defaultWeightStep: 2.5 }`; `getSettings(): Promise<AppSettings>` (returns stored or defaults, never undefined); `updateSettings(patch: Partial<Omit<AppSettings,'key'>>): Promise<AppSettings>`.
- `storage.ts`: `requestPersistentStorage(): Promise<boolean>` — calls `navigator.storage?.persist?.()` only if `navigator.storage.persisted()` is false; returns false when the API is missing; never throws.

- [ ] **Step 1: Install** (main session): `npm i dexie` and `npm i -D fake-indexeddb jsdom @testing-library/react`.
- [ ] **Step 2: Write failing tests:**
  - `db.test.ts › zapis treningu i serii przetrwa ponowne otwarcie bazy`: add a `Workout` and two `WorkoutSet`s, `db.close()`, `db.open()`, query `sets.where('workoutId')` → 2 sets with same weight/reps.
  - `db.test.ts › serie ćwiczenia da się pobrać po exerciseId`: 3 sets across 2 workouts for exercise `'ex1'`, 1 for `'ex2'` → `sets.where('exerciseId').equals('ex1').count()` is 3.
  - `settings.test.ts › domyślne ustawienia`: on empty db `getSettings()` deep-equals `DEFAULT_SETTINGS`.
  - `settings.test.ts › zmiana ustawień zostaje zapisana`: `updateSettings({ barWeight: 15 })` then `getSettings()` → `barWeight` 15, `plates` unchanged.
  - `storage.test.ts`: with `navigator.storage` mocked `persisted→false, persist→true` → returns true and `persist` called once; with `persisted→true` → `persist` not called; with `navigator.storage` undefined → returns false.
- [ ] **Step 3: Run** `npx vitest run` → FAIL (modules missing).
- [ ] **Step 4: Implement** `types.ts`, `db.ts`, `settings.ts`, `storage.ts`; wire `requestPersistentStorage()` in `main.tsx` (fire-and-forget).
- [ ] **Step 5: Run** `npx vitest run` → all pass; `npm run build` passes.
- [ ] **Step 6: Commit** `feat: local data layer with Dexie`

### Task 3: Installable offline PWA

**Files:**
- Create: `public/icon.svg` (simple dumbbell mark on `--bg`, Claude designs), generated `public/pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png` (via `@vite-pwa/assets-generator` preset `minimal-2023`, `pwa-assets.config.ts`)
- Modify: `vite.config.ts` (add `VitePWA`), `index.html` (apple-touch-icon link, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=black-translucent`)
- Create: `e2e/pwa.spec.ts`; add Playwright project `pwa` whose `webServer` runs `npm run build && npm run preview -- --port 4173`

**Interfaces:**
- `VitePWA({ registerType: 'autoUpdate', manifest: { name: 'Gym', short_name: 'Gym', lang: 'pl', display: 'standalone', orientation: 'portrait', start_url: '.', scope: '.', background_color, theme_color: <--bg value>, icons: [...] }, workbox: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'] } })`. App name `'Gym'` is a placeholder until the owner picks one — keep it in one constant `APP_NAME` in `src/appName.ts`, also used for `<title>`.

- [ ] **Step 1: Install** (main session): `npm i -D vite-plugin-pwa @vite-pwa/assets-generator`.
- [ ] **Step 2: Write failing tests** `e2e/pwa.spec.ts` (against the preview build):
  - `manifest jest poprawny`: fetch the `link[rel=manifest]` href → JSON has `display: 'standalone'`, `lang: 'pl'`, an icon with `sizes: '512x512'`.
  - `działa offline po pierwszej wizycie`: goto `/`, wait for `navigator.serviceWorker.ready` and a controller (reload once if needed), `context.setOffline(true)`, reload, go to `/#/statystyki` → `h1` is "Statystyki".
- [ ] **Step 3: Run** `npx playwright test --project=pwa` → FAIL.
- [ ] **Step 4: Implement** PWA config, icons, head tags.
- [ ] **Step 5: Run** all tests: `npx vitest run` and `npx playwright test` → all pass.
- [ ] **Step 6: Commit** `feat: installable offline PWA`

### Task 4: Hosting on GitHub Pages (needs the owner)

Requires the owner's GitHub account; the main session guides, the owner logs in. Not delegated.

**Files:**
- Create: `.github/workflows/deploy.yml` — on push to `main`: `npm ci`, `npx vitest run`, `VITE_BASE=/<repo-name>/ npm run build`, deploy `dist` with `actions/upload-pages-artifact` + `actions/deploy-pages`.

- [ ] **Step 1:** Owner creates a public GitHub repo (name decided then) and enables Pages → Source: GitHub Actions. Git identity for this repo: owner's GitHub `…@users.noreply.github.com` address (never the private e-mail).
- [ ] **Step 2:** Add workflow, push, wait for the Actions run to succeed.
- [ ] **Step 3: Verify:** open `https://<user>.github.io/<repo>/` in the built-in browser at phone size: five tabs work, manifest loads, reload on `/#/historia` works.
- [ ] **Step 4:** Owner opens the link on the iPhone in Safari → Udostępnij → „Do ekranu początkowego”; app opens full-screen, nav not under the home indicator.
- [ ] **Step 5: Commit** `ci: deploy to GitHub Pages`
