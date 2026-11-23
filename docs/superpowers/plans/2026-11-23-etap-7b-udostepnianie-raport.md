# Etap 7b — wysyłanie planu i raport Excel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a plan to a friend as a link + QR code (no server) and export an `.xlsx` report for a coach, both delivered only through the user's own share action.

**Architecture:** Pure data modules in `src/data/` (`planShare.ts` encode/decode/import, `report.ts` report data, `reportXlsx.ts` workbook) with Vitest tests; UI pages in `src/pages/`. The plan travels in the hash route `#/plan?d=<lz-string>`; ExcelJS and the QR library are loaded with `import()` so the main bundle stays small. One shared helper `shareFile()` (share sheet → download fallback) serves the backup and the report.

**Tech Stack:** React 19 + TS + Vite, Dexie, HashRouter, lz-string 1.5 (MIT), qrcode-generator 1.5 (MIT), ExcelJS 4.4 (MIT), Vitest + fake-indexeddb, Playwright (iPhone 13 profile).

**Spec:** `docs/superpowers/specs/2026-11-22-gym-app-design.md` (sekcja 7 „Wysyłanie planu znajomemu”, „Ustalenia po przeglądzie” — udostępniony plan = niezależna kopia) + zadanie etapu 7b (raport dla trenera).

## Global Constraints

- Polish UI, dark tokens from `src/theme/tokens.css`, iPhone safe areas (existing page layout already pads them; new sheets reuse `Sheet.css`).
- Nothing leaves the phone except through `navigator.share` / download / clipboard started by a tap.
- No server, zero cost; new libraries MIT only.
- Shared plan = independent copy (new plan id, new day ids, no link to the original).
- Main bundle must not contain ExcelJS or qrcode-generator (dynamic `import()` only).
- Report filename `raport-YYYY-MM-DD_YYYY-MM-DD.xlsx` (first and last day, inclusive).
- Excel dates: Polish format `dd.mm.yyyy`, written as UTC dates built from local Y/M/D (ExcelJS writes Date as UTC; a local midnight would show the previous day).

## Review Focus

1. **iPhone: link opens in Safari, not in the installed app** (separate storage) → import page tells the user to copy the link, and Plany has „Dodaj plan z linku” (paste field). Test: e2e pastes a link on Plany.
2. **Link cut by a messenger / pasted with extra text** → `extractPayload()` finds `d=` anywhere in pasted text; a truncated payload shows „Link jest uszkodzony”, never a crash. Test: unit (truncated, garbage, wrong version) + e2e corrupted link.
3. **Same custom exercise imported twice / receiver already has it** → reuse by id, then by name (case-insensitive) among custom exercises; no duplicates. Test: unit.
4. **Very long plan** → link > 1800 chars shows „Plan jest za duży na kod QR — wyślij link” instead of a QR. Test: unit `qrFits()`.
5. **Custom range with from > to, or empty period** → error message / report with zero rows still generates valid sheets with headers. Test: unit.

---

### Task 1: `shareFile` helper (refactor backup share)

**Files:**
- Create: `src/data/shareFile.ts`
- Modify: `src/data/backupShare.ts` (use `shareFile`, keep `SaveResult`, `saveBackupFile`, `useMakeBackup` exports unchanged)

**Interfaces:**
- Produces: `export type SaveResult = 'shared' | 'downloaded' | 'cancelled' | 'needs-tap'`; `export async function shareFile(file: File): Promise<SaveResult>` (body = current `saveBackupFile` minus `toFile`). `backupShare.ts` re-exports `SaveResult`.

- [ ] Move the logic, run `npx vitest run` and `npx playwright test e2e/backup.spec.ts` — both PASS unchanged.

### Task 2: `planShare.ts` — encode, decode, preview, import

**Files:**
- Create: `src/data/planShare.ts`, `src/data/planShare.test.ts`

**Interfaces:**
- Payload v1 (JSON, compact): `{ v: 1, n: string, d: [string, [number, number, number, number, number, number][]][], e: ([id, name] | [id, name, primary[], secondary[], equipment|null])[] }` — day = `[name, items]`, item = `[exerciseIndex, sets, warmupSets, repsMin, repsMax, restSec]`; `e` lists each exercise once; the 5-element form only for custom exercises.
- `export const SHARE_ROUTE = '/plan'`
- `export function encodePlan(plan: Plan, exercises: Map<string, Exercise>): string` → `LZString.compressToEncodedURIComponent(JSON.stringify(payload))`
- `export type SharedPlan = { name: string; days: { name: string; items: (Omit<PlanItem,'exerciseId'> & { exercise: SharedExercise })[] }[]; exercises: SharedExercise[] }`; `SharedExercise = { id: string; name: string; custom: boolean; primaryMuscles: string[]; secondaryMuscles: string[]; equipment: string | null }`
- `export function decodePlan(data: string): SharedPlan` — throws `Error('Link jest uszkodzony')` on: decompress null/empty, bad JSON, `v !== 1`, wrong shapes, index out of range, non-finite numbers, empty name. Clamp numbers to sane ranges (sets 1–20, warmup 0–10, reps 1–100, rest 0–900; repsMin ≤ repsMax). Name trimmed, max 80 chars.
- `export function shareUrl(data: string, base = location.origin + location.pathname): string` → `${base}#/plan?d=${data}`
- `export function extractPayload(text: string): string | null` — `/[?&]d=([A-Za-z0-9+\-$_.]+)/` (lz encoded alphabet), else null.
- `export const QR_MAX_URL = 1800`; `export function qrFits(url: string): boolean`
- `export type ExerciseStatus = 'known' | 'new-custom' | 'unknown'`; `export async function resolveExercises(sp: SharedPlan): Promise<Map<string, { status: ExerciseStatus; targetId?: string }>>` — known: same id in db (any exercise) OR a custom exercise with the same name (case-insensitive, trimmed) for custom ones OR an exact-name (case-insensitive) match for unknown built-ins; `new-custom`: custom not present; `unknown`: built-in id missing and no name match (created as custom on import, no muscles).
- `export async function importSharedPlan(sp: SharedPlan): Promise<Plan>` — one Dexie transaction over `plans, exercises, settings`; creates missing exercises (`custom: true`, `category: 'strength'`, `instructions: []`, `images: []`; keeps sender id for custom, `custom-<uuid>` for unknown built-in), new plan with new ids, `startedAt` today, name unchanged; sets `activePlanId` when none is active (like `createPlan`).

- [ ] **Tests (Vitest, fake-indexeddb as in `plans.test.ts`):**
  - `round-trip keeps name, days, items and custom exercise fields` — encode a plan with 2 days, 1 built-in + 1 custom (`primaryMuscles: ['chest']`, equipment `'cable'`) → decode → equal values.
  - `encoded string is URL-safe` — `/^[A-Za-z0-9+\-$_.]*$/`.
  - `corrupted payload throws Link jest uszkodzony` — `'abc'`, `data.slice(0, data.length/2)`, `compressToEncodedURIComponent('{"v":2}')`, `compressToEncodedURIComponent('[]')`, item index 99.
  - `numbers are clamped` — sets 999 → 20, repsMin 12 / repsMax 8 → 8/8 (min ≤ max via min of both).
  - `extractPayload finds d= in pasted text` — `'Zobacz: https://x/gym-app/#/plan?d=N4Ig ok'` → `'N4Ig'`; `'hello'` → null.
  - `qrFits` — 1800 chars true, 1801 false.
  - `import creates missing custom exercise, reuses existing by id and by name, unknown built-in becomes custom` and `import twice does not duplicate the custom exercise`.
  - `imported plan is an independent copy` — new plan id ≠ sender id, day ids new, editing it leaves the source untouched; becomes active when none active.

### Task 3: `report.ts` — report data per period

**Files:**
- Create: `src/data/report.ts`, `src/data/report.test.ts`

**Interfaces:**
- Consumes: `StatsInput`-like data, `workingSets` (records.ts), `epley1RM` (progression.ts), `workoutDurationSec` (history.ts), `isFinished` (workouts.ts), `periodRange` (stats.ts), `BODY_METRICS` (body.ts).
- `export type ReportPeriod = 'week' | 'month' | 'year' | 'all' | 'custom'`
- `export function reportRange(p: ReportPeriod, now: number, firstAt?: number, custom?: { from: string; to: string }): { start: number; end: number; from: string; to: string }` — week/month/year = current calendar one via `periodRange(p, 0, now)`; all = first workout day (or today) → today; custom = local midnight of `from` → midnight after `to`; throws `Error('Data początkowa jest po końcowej')` when from > to, `Error('Wybierz obie daty')` when empty. `from`/`to` = inclusive `YYYY-MM-DD`.
- `export function reportFileName(r: { from: string; to: string }): string` → `raport-${from}_${to}.xlsx`
- `export interface ReportInput { workouts: Workout[]; sets: WorkoutSet[]; exercises: Map<string, { name: string }>; body: BodyEntry[] }`; `export async function loadReportInput(): Promise<ReportInput>`
- `export interface ReportData { from: string; to: string; summary: { workouts: number; timedWorkouts: number; totalSec: number; workingSets: number; volume: number; records: { date: number; exercise: string; kind: 'Ciężar' | 'Szacowany 1RM'; value: number; previous: number }[]; body: { label: string; unit: string; start?: number; end?: number; change?: number }[] }; workouts: { date: number; name: string; durationMin?: number; exercises: string; workingSets: number; volume: number }[]; sets: { date: number; workout: string; exercise: string; set: number; weight: number; reps: number; rir?: number; warmup: boolean }[]; progress: { exercise: string; workingSets: number; startWeight: number; endWeight: number; startE1rm: number; endE1rm: number }[]; body: { date: string; values: Partial<Record<BodyMetric, number>> }[] }`
- `export function buildReport(input: ReportInput, range: { start: number; end: number; from: string; to: string }): ReportData`
  - only finished workouts with `startedAt` in `[start, end)`; sets only completed; `set` = 1-based order within exercise in that workout (warm-ups included, sorted by `exerciseOrder`, `setOrder`).
  - volume = Σ weight×reps of working sets (rounded to 0.1).
  - records: per exercise and kind (heaviest working weight, e1RM), the best in the period beating the best of all earlier finished workouts; exercises with no earlier history are skipped (same rule as `summarizeWorkout`); date = first workout in range that beat it.
  - progress: per exercise trained in range, best working weight and best e1RM (rounded 0.1) in its first vs last workout in the range; sorted by exercise name (`localeCompare(…, 'pl')`).
  - body summary: for every metric in `BODY_METRICS`, first and last value among entries with `date` in `[from, to]`; change = end − start when both from different entries; skip metrics with no values.

- [ ] **Tests:**
  - `reportRange` for week (Mon–Sun containing now), month (`2026-11-01`…`2026-11-30`), year, all (first workout day → today), custom inclusive edges (a workout at 23:59 on `to` is in, one at 00:00 the day after is out; one at 00:00 on `from` is in), `from > to` throws, empty throws.
  - `reportFileName` → `raport-2026-11-01_2026-11-30.xlsx`.
  - `buildReport` on a fixture of 3 workouts (one before range, two inside; one imported without duration; warm-up set; unfinished set; RIR): counts, totalSec only from timed, volume, set numbering, records (weight beaten → 1 record; first-time exercise → none), progress start vs end, body changes, empty range → zero counts and empty arrays.

### Task 4: `reportXlsx.ts` — workbook

**Files:**
- Create: `src/data/reportXlsx.ts`, `src/data/reportXlsx.test.ts`

**Interfaces:**
- `export const SHEETS = ['Podsumowanie', 'Treningi', 'Serie', 'Progres ćwiczeń', 'Pomiary ciała'] as const`
- `export const HEADERS: Record<'Treningi'|'Serie'|'Progres ćwiczeń', string[]>` = Treningi: `['Data', 'Dzień', 'Czas (min)', 'Ćwiczenia', 'Serie robocze', 'Objętość (kg)']`; Serie: `['Data', 'Trening', 'Ćwiczenie', 'Seria', 'Ciężar (kg)', 'Powtórzenia', 'RIR', 'Rozgrzewka']`; Progres ćwiczeń: `['Ćwiczenie', 'Serie robocze', 'Najlepszy ciężar – początek (kg)', 'Najlepszy ciężar – koniec (kg)', 'Zmiana (kg)', 'Szac. 1RM – początek (kg)', 'Szac. 1RM – koniec (kg)', 'Zmiana 1RM (kg)']`. Pomiary ciała: `Data` + `BODY_METRICS` labels with unit (`Waga (kg)`, …).
- `export async function buildWorkbook(data: ReportData): Promise<ExcelJS.Workbook>`; `export async function reportBlob(data: ReportData): Promise<Blob>` (xlsx MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).
- Formatting: header row bold, fill `FF1F6FEB`-ish accent with white text, frozen (`views: [{ state: 'frozen', ySplit: 1 }]`), column widths, dates `dd.mm.yyyy` (Treningi also `hh:mm` column not needed), weights `0.0`, volume `# ##0` (`#,##0`), RIR/Rozgrzewka text („Tak”/„Nie”). Podsumowanie: two columns `Pozycja | Wartość` with sections (Okres, Treningi, Łączny czas `h:mm` as text „12 h 30 min”, Serie robocze, Objętość, Nowe rekordy count), then a records table (`Data | Ćwiczenie | Rekord | Wartość (kg) | Poprzednio (kg)`) and a body table (`Wymiar | Początek | Koniec | Zmiana`).

- [ ] **Tests:** sheet names equal `SHEETS`; header rows equal `HEADERS`; header row bold and frozen; a date cell reads back as the same calendar day with `numFmt` `dd.mm.yyyy`; `reportBlob` → load back with `wb.xlsx.load(arrayBuffer)` works; empty `ReportData` still has all sheets with headers.

### Task 5: UI — wysyłanie planu

**Files:**
- Create: `src/pages/PlanSharePage.tsx` (route `/plany/:planId/wyslij`), `src/pages/PlanImportPage.tsx` (route `/plan`), `src/components/QrCode.tsx`, `src/pages/PlanSharePage.css`
- Modify: `src/App.tsx` (routes), `src/pages/PlanDetailPage.tsx` (button „Wyślij plan”), `src/pages/PlansPage.tsx` („Dodaj plan z linku” → sheet with textarea → navigate to `/plan?d=…` or alert „To nie jest link do planu”), `e2e/plans-share.spec.ts`, `playwright.config.ts` (add spec to mobile project)

- Share page: title „Wyślij plan”, plan name, QR (`QrCode` lazy-imports `qrcode-generator`, type 0, level `'L'`, renders `createSvgTag`-style `<svg>` from module data with dark-on-white quiet zone, `role="img" aria-label="Kod QR planu"`) or the too-long note, buttons „Udostępnij link” (`navigator.share({ title, text: 'Plan treningowy: <name>', url })`, hidden when no `navigator.share`) and „Kopiuj link” (clipboard → status „Skopiowano link”), the link in a read-only field, hint „Znajomy otwiera link albo skanuje kod aparatem. Plan dodaje się jako jego osobna kopia.”
- Import page: decode `useSearchParams().get('d')`; error → `role="alert"` „Link jest uszkodzony albo niepełny. Poproś o wysłanie planu jeszcze raz.” + link to Plany; preview: h1 plan name, per day `h2` + list „Exercise name — 3 × 8–12 · przerwa 2:00 (+1 rozgrzewkowa)”, badges „nowe ćwiczenie” (new-custom) / „nieznane — doda się jako własne” (unknown); note when not standalone (`!matchMedia('(display-mode: standalone)').matches && !navigator.standalone`): „Masz aplikację na ekranie głównym? Skopiuj link i w aplikacji wybierz Plany → Dodaj plan z linku.”; button „Dodaj plan” → `importSharedPlan` → `navigate('/plany/<id>', { replace: true })`.
- [ ] **E2E:** create plan with day + 2 exercises (one custom created in Ćwiczenia), open Wyślij plan → QR visible, link field has `#/plan?d=`; clear IndexedDB (new context), open the link → preview shows exercises + „nowe ćwiczenie”, Dodaj plan → plan detail; custom exercise exists in Ćwiczenia → Moje; corrupted link → alert; Plany → Dodaj plan z linku with pasted text → preview.

### Task 6: UI — raport dla trenera

**Files:**
- Create: `src/pages/ReportPage.tsx`, `src/pages/ReportPage.css`, `e2e/report.spec.ts`
- Modify: `src/App.tsx` (route `/statystyki/raport`), `src/pages/StatsPage.tsx` (link „Raport dla trenera” under the period tiles on the Treningi tab), `playwright.config.ts`

- Page: back link Statystyki, h1 „Raport dla trenera”, `Segmented` with Tydzień / Miesiąc / Rok / Od początku / Własny; Własny shows two `<input type="date">` labelled „Od” / „Do” (default first day of month / today); line „Okres: 01.11.2026 – 30.11.2026 · 12 treningów”; button „Utwórz raport” → `await import('../data/reportXlsx')` → blob → `new File([blob], reportFileName(r))` → `shareFile`; states like backup (busy „Tworzę raport…”, needs-tap „Raport gotowy — dotknij, aby wysłać”, done „Raport wysłany” / „Raport pobrany”, cancelled, error `role="alert"`); note „Plik powstaje na telefonie. Nic nie jest wysyłane, dopóki sam go nie udostępnisz.”
- [ ] **E2E:** import sample CSV, open Statystyki → Raport dla trenera, choose Od początku → download `raport-YYYY-MM-DD_YYYY-MM-DD.xlsx`; load it with ExcelJS in the test → 5 sheets, Serie has 12 data rows; Własny with from > to → alert.

### Task 7: Verify, commit, deploy

- [ ] `npx vitest run`, `npx tsc -b`, `npx oxlint`, `npx playwright test` all PASS; `npm run build` and check that the main `index-*.js` chunk does not contain `exceljs` (grep `ExcelJS`/`xlsx` strings) and size stays near previous.
- [ ] Phone-size check in the built-in browser (preview `gym-app`): share page, import preview, report page.
- [ ] Bump `package.json` version 0.7.0 → 0.8.0; update spec „Etapy” note; commit own files by name; push `main`; confirm the Actions deploy and the live site.
