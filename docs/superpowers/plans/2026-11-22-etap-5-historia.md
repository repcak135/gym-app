# Etap 5 (Historia, rekordy, import) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Historia tab (month calendar with workout dots + list, workout detail with edit/delete), per-exercise records (card + finish summary), and CSV import of the owner's old app history with an exercise-matching screen.

**Architecture:** Pure functions (no Dexie) in `src/data/csvImport.ts` (parse, group, match) and `src/data/records.ts` (records from sets). Dexie-touching code in `src/data/history.ts` (calendar/list queries, edit/delete) and `src/data/importHistory.ts` (plan + commit of an import). UI: `HistoryPage` (calendar + list), `WorkoutDetailPage` (`/historia/:id`), `ImportPage` (`/ustawienia/import`, steps: file → match → done). No DB schema change (`workouts.importKey` and `aliases` already exist in version 1).

**Tech Stack:** React 19, react-router 8 (HashRouter), Dexie 4 + dexie-react-hooks, lucide-react, Vitest + fake-indexeddb, Playwright (project `mobile`, iPhone 13).

**Spec:** `docs/superpowers/specs/2026-11-22-gym-app-design.md` (sections "4. Historia", "5. Rekordy", "8. Import historii z obecnej aplikacji", "Ustalenia po przeglądzie").

## Global Constraints

- Polish UI, exercise names in English; numbers with comma decimals (`formatKg`).
- Dark tokens from `src/theme/tokens.css`; touch targets ≥ 44 px; full-screen views pad with `env(safe-area-inset-top/bottom)`.
- "Rozgrzewki nie liczą się do rekordów ani statystyk." Records use only `!warmup && completedAt !== undefined` sets of finished workouts (`isFinished`).
- 1RM = Epley (`epley1RM` in `progression.ts`).
- CSV header (verbatim): `Date,Workout name,Exercise,Set,Weight,Reps,Distance,Duration,Measurement unit,Notes`. One workout = rows with the same `Date` value; workout name = `Workout name`.
- Imported workouts: `source: 'import'`, no `endedAt` (no duration, not counted in time stats), sets `warmup: false`, `completedAt = workout.startedAt` (so `getExerciseHistory` sees them).
- "Ponowny import tego samego pliku nie dubluje treningów": `importKey = 'csv|' + Date + '|' + Workout name`; workouts whose key exists are skipped.
- Matches remembered in `aliases` (`sourceName` = trimmed CSV name).
- Privacy: the owner's real file (`gym-day.csv`) is never committed; tests use `tests/fixtures/sample-export.csv` (made-up, ~20 rows).
- File picker must work in iOS standalone PWA: a real `<input type="file">` inside a `<label>` (no programmatic click after async work), `accept=".csv,text/csv,text/comma-separated-values,text/plain"`.

## Review Focus

- Re-importing the same file (or a newer export that contains the old rows) → only new workouts added, sets not duplicated. Test: Task 3 `commitImport twice`.
- CSV quirks: UTF-8 BOM, CRLF, trailing spaces in names (`"Lat pulldown klęcząc jedną ręką "`), quoted fields with commas, blank lines, `lbs` unit → parsed correctly / converted to kg; bad rows counted as skipped, never NaN in DB. Test: Task 1 `parseCsv quirks`.
- Two CSV names mapped to the same exercise inside one workout → one exercise block, set orders continue. Test: Task 3.
- Deleting the last set of an exercise / a whole workout in history → records and calendar update, nothing orphaned. Test: Task 2 `deleteWorkout`.
- Records with history of only warm-ups or reps 0 → no crash, no bogus record. Test: Task 2 `records`.

---

### Task 1: CSV parsing, grouping and matching (pure)

**Files:**
- Create: `src/data/csvImport.ts`, `src/data/csvImport.test.ts`, `tests/fixtures/sample-export.csv`

**Interfaces:**
- Produces:
  - `parseCsv(text: string): { rows: ImportRow[]; skipped: number }` where `ImportRow = { date: string; startedAt: number; workoutName: string; exercise: string; set: number; weight: number; reps: number }` (weight in kg, lb×0.45359237 rounded to 0.01; `startedAt` = local time of `YYYY-MM-DD HH:MM:SS`).
  - `groupWorkouts(rows: ImportRow[]): ImportWorkout[]`, `ImportWorkout = { importKey: string; name: string; startedAt: number; rows: ImportRow[] }`, sorted by `startedAt`.
  - `normalizeName(name: string): string[]` (tokens), `matchScore(a: string, b: string): number` (0–1).
  - `matchExercises(names: string[], exercises: Pick<Exercise,'id'|'name'>[], aliases: ExerciseAlias[]): NameMatch[]`, `NameMatch = { sourceName: string; exerciseId: string | null; score: number; how: 'alias' | 'exact' | 'fuzzy' | 'none' }`.

- [ ] Step 1: fixture with: 3 workouts (one repeated in a second "export" variant), BOM, CRLF, one quoted name with a comma, one blank line, one row with `Reps` empty (skipped), one `lbs` row, name with trailing space.
- [ ] Step 2: tests — `parseCsv` counts rows/skipped, BOM/quotes/lbs; `groupWorkouts` gives 3 workouts with keys `csv|<Date>|<name>`; `matchExercises`: alias wins over exact; exact is case-insensitive (`dumbbell bench press` → Dumbbell Bench Press); fuzzy `Wide Grip Lat Pull Down` → `Wide-Grip Lat Pulldown` (score 1), `Pull Ups` → `Pullups`, `Barbell Bench Press` → `Barbell Bench Press - Medium Grip`, `Dumbbell Shrugs` → `Dumbbell Shrug`; `Wiosło Krzywe` → `none`.
- [ ] Step 3: implement. Normalisation: lowercase, strip diacritics, `pull down`/`pull-down` → `pulldown` (same for push down), drop the ` - medium grip` suffix, split on non-alphanumerics, singularise via a small synonym map (curls→curl, raises→raise, rows→row, ups→up, bicep→biceps, tricep→triceps, flyes/flies→fly, …), drop stop words (`with, the, a, on, to, of, and, over`). Score = weighted Dice over token sets (generic words `machine, standing, seated` weigh 0.5). Fuzzy accepted as suggestion when best score ≥ 0.5; ties → shorter DB name.
- [ ] Step 4: `npx vitest run src/data/csvImport.test.ts` PASS. Commit.

### Task 2: Records and history data (Dexie)

**Files:**
- Create: `src/data/records.ts`, `src/data/records.test.ts`, `src/data/history.ts`, `src/data/history.test.ts`
- Modify: `src/data/workouts.ts` (`summarizeWorkout` adds kind `'reps'`)

**Interfaces:**
- Produces:
  - `computeRecords(history: { workout: Workout; sets: WorkoutSet[] }[]): ExerciseRecords | null` → `{ heaviest: { weight; reps; at }; e1rm: { value; weight; reps; at }; volume: { value; at }; repsAtWeight: { weight; reps; at }[] /* best reps per weight, heaviest first, max 6 */ }` (`at` = workout startedAt). Null when no working set with reps > 0.
  - `getExerciseRecords(exerciseId: string): Promise<ExerciseRecords | null>` (in `history.ts`, via `getExerciseHistory`).
  - `RecordKind = 'weight' | 'e1rm' | 'volume' | 'reps'`; `NewRecord` gains optional `weight?: number; reps?: number` (for `'reps'`: reps at a weight done before, more than ever at that weight).
  - `history.ts`: `listFinishedWorkouts(): Promise<WorkoutListItem[]>` (`{ workout; sets: number /*working*/; exercises: number; durationSec?: number }`, newest first); `workoutDays(items, year, month): Set<number>`; `deleteWorkout(id)`; `getWorkoutDetail(id): Promise<{ workout; groups: { exerciseId; sets: WorkoutSet[] }[] } | undefined>`; edits reuse `updateSet` / `removeSet` from `workouts.ts`.
- [ ] Tests: records ignore warm-ups and reps 0; e1rm uses Epley; volume per workout; repsAtWeight best per weight; summary reports `'reps'` record (30×11 after 30×10) and not for a never-done weight; `deleteWorkout` removes sets; `listFinishedWorkouts` excludes the active workout, durations only for app workouts.
- [ ] Implement, run `npx vitest run`, commit.

### Task 3: Import commit (Dexie)

**Files:**
- Create: `src/data/importHistory.ts`, `src/data/importHistory.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `prepareImport(text: string): Promise<ImportPreview>` → `{ workouts: ImportWorkout[]; newWorkouts: number; existingWorkouts: number; sets: number; skipped: number; names: (NameMatch & { sets: number })[] }`; `commitImport(preview, choices: Record<string, string | 'custom'>): Promise<{ workouts: number; sets: number; created: number }>` — creates custom exercises (`custom: true`, `primaryMuscles: []`, category `strength`) for `'custom'`, saves aliases for all names, inserts only workouts whose `importKey` is new, one transaction.
- [ ] Tests: commit twice → second adds 0; aliases saved and reused by a new `prepareImport` (`how: 'alias'`); custom created once even if referenced by two names; two names → same exercise in one workout merge with continuing `setOrder`; sets have `completedAt = startedAt`, `warmup false`.
- [ ] Implement, run, commit.

### Task 4: Historia screen + workout detail

**Files:**
- Modify: `src/pages/HistoryPage.tsx`, `src/App.tsx` (route `/historia/:id`)
- Create: `src/pages/HistoryPage.css`, `src/pages/WorkoutDetailPage.tsx`, `src/pages/WorkoutDetailPage.css`, `src/components/SetEditSheet.tsx`, `e2e/history.spec.ts`

- Calendar: header `‹ listopad 2026 ›` (buttons "Poprzedni miesiąc"/"Następny miesiąc", horizontal swipe ≥ 50 px), weeks start Monday, today outlined, dot on workout days; tap a dot day → list shows that day (chip "Cały miesiąc" resets). List under it: month's workouts newest first, each a link: date + weekday (`pon., 18.11.2026`), name, `N serii · M ćwiczeń`, duration `1:02:13` when known, badge "Import" for imported. Empty month: "Brak treningów w tym miesiącu."
- Detail `/historia/:id`: back, name, date, duration, per exercise block (name links to `/cwiczenia/:id`), sets "1. 30 kg × 10" (warm-ups marked "R"), tap a set → `SetEditSheet` (weight text with comma, reps, warm-up switch, RIR 0–5+ chips + "brak", "Usuń serię"), "Usuń trening" → `ConfirmSheet` → back to `/historia`.
- [ ] e2e: seed a finished workout via a real workout run (existing helper pattern), open Historia, see dot + list item, open detail, edit reps, delete with confirm.
- [ ] Commit.

### Task 5: Records on exercise card and summary

**Files:** Modify `src/pages/ExerciseDetailPage.tsx` (+css), `src/pages/WorkoutSummaryPage.tsx`
- Card section "Rekordy" (only when records exist): tiles Najcięższa seria `40 kg × 6`, Szac. 1RM `48 kg`, Największa objętość `1 200 kg`, each with date; table "Najwięcej powtórzeń" weight → reps.
- Summary: `'reps'` label "więcej powtórzeń: 30 kg × 11".
- [ ] e2e in `history.spec.ts`: card shows Rekordy after a workout. Commit.

### Task 6: Import screen

**Files:** Create `src/pages/ImportPage.tsx`, `src/pages/ImportPage.css`; modify `SettingsPage.tsx` (section "Dane": link "Importuj historię"), `App.tsx` (route `/ustawienia/import`), `e2e/import.spec.ts`.
- Step 1: explanation + file input label "Wybierz plik CSV". Error for wrong header: "To nie wygląda na eksport z aplikacji (brak kolumn Date, Exercise, Weight, Reps)."
- Step 2 "Dopasuj ćwiczenia": summary (`N nowych treningów, M już zaimportowanych, S serii`), section "Do sprawdzenia" (score < 0.85 or none) and collapsible "Dopasowane automatycznie (K)"; each row: CSV name, sets count, current choice, buttons "Zmień" (ExercisePicker `single`) and "Jako własne"/"Użyj propozycji". Score < 0.5 defaults to custom. Button "Importuj N treningów".
- Step 3: "Zaimportowano N treningów (S serii)", link to Historia.
- [ ] e2e: `setInputFiles` with fixture, change one match, import, Historia shows imported workouts; second import → "0 nowych".
- [ ] Commit, push, confirm Pages deploy.
