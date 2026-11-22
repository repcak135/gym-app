# Etap 2: Ćwiczenia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Ćwiczenia tab: 876 exercises from free-exercise-db seeded into IndexedDB, a searchable/filterable list with "Ostatnio używane", an exercise card (photos, Polish tips, muscles, instructions, the owner's editable note) and custom exercises (create, edit, delete).

**Architecture:** The free-exercise-db JSON is bundled as `src/data/exercise-db.json` and loaded with a dynamic `import()` (own chunk, precached by the service worker) only when the seed is missing or outdated; `seedExercises()` runs once at startup. All data access stays in `src/data/` (pure filter/label helpers + Dexie functions); pages read live data with `useLiveQuery` from `dexie-react-hooks`. Photos are `<img crossorigin="anonymous" loading="lazy">` from raw.githubusercontent.com, cached by a Workbox `CacheFirst` runtime route.

**Tech Stack:** existing stack (React 19, TS, Vite, react-router HashRouter, Dexie 4, vite-plugin-pwa, lucide-react, Vitest + fake-indexeddb + Testing Library, Playwright) + `dexie-react-hooks`.

**Spec:** `docs/superpowers/specs/2026-11-22-gym-app-design.md` (section „1. Ćwiczenia”, „Decyzje techniczne”, „Ustalenia po przeglądzie”)

**Execution notes (this project):** Code is written by Sonnet 4.6 via agy (`run-agy.sh … --model claude-sonnet-4-6 --mode accept-edits`), launched from the PowerShell tool, with "never use the terminal". The main session runs every shell command, writes `tips-pl.json` itself and verifies each task.

## Global Constraints

- UI in Polish; exercise names, instructions stay English (from the database).
- Dark theme only, colours/spacing only via tokens in `src/theme/tokens.css`; touch targets ≥ 44 px.
- Image base URL exactly `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/`; no other image source (never MuscleWiki / openGym / owner's app).
- Data only on the device; no server.
- Seeding must never touch custom exercises, notes, plans, workouts or sets.
- Ids: database exercises keep the free-exercise-db `id` (e.g. `Barbell_Squat`); custom exercises get `custom-<uuid>`.
- Polish tips live in `src/data/tips-pl.json` as `{ "<exerciseId>": string[] }`; an exercise without tips shows no tips section.

## Review Focus

1. App updated while offline / seed interrupted (app closed mid-seed) → next start re-seeds; seed is idempotent and versioned (`EXERCISE_DB_VERSION`). (Task 1 test: second run doesn't duplicate, custom exercise survives.)
2. Search typed with different case, extra spaces or word order ("press bench") → still finds "Barbell Bench Press - Medium Grip". (Task 1 test)
3. Deleting a custom exercise that is already used in a plan or a workout → refused with a Polish message, nothing orphaned. (Task 1 test)
4. No signal in the gym: photos seen once must show offline → CacheFirst runtime cache for raw.githubusercontent.com with CORS (`crossorigin="anonymous"`), photo failure shows a placeholder, not a broken image. (Task 2 config + Task 3 `onError`)
5. Note typed and the app closed right away → note saved on every change (debounced ≤ 500 ms) and on blur/unmount; empty note deletes the row. (Task 1 test for save/delete; Task 3 e2e reload test)

---

### Task 1: Data layer — seed, labels, search, recent, notes, custom exercises

**Files:**
- Create: `src/data/exercise-db.json` (main session copies the upstream `dist/exercises.json` verbatim)
- Create: `src/data/exerciseLabels.ts`, `src/data/exercises.ts`, `src/data/tips-pl.json` (main session; start as `{}` until Task 4)
- Modify: `src/data/types.ts` (add `exerciseDbVersion?: number` to `AppSettings`)
- Modify: `src/main.tsx` (call `void seedExercises()` after `requestPersistentStorage()`)
- Test: `src/data/exercises.test.ts`

**Interfaces:**
- Produces in `exerciseLabels.ts`:
  - `MUSCLES: readonly string[]` (the 17 upstream values) and `MUSCLE_PL: Record<string,string>`: abdominals Brzuch, abductors Odwodziciele, adductors Przywodziciele, biceps Biceps, calves Łydki, chest Klatka piersiowa, forearms Przedramiona, glutes Pośladki, hamstrings Dwugłowe ud, lats Najszersze grzbietu, lower back Dolny odcinek pleców, middle back Środek pleców, neck Szyja, quadriceps Czworogłowe ud, shoulders Barki, traps Kaptury, triceps Triceps.
  - `EQUIPMENT: readonly string[]` and `EQUIPMENT_PL`: bands Gumy, barbell Sztanga, body only Masa ciała, cable Wyciąg, dumbbell Hantle, e-z curl bar Gryf łamany, exercise ball Piłka gimnastyczna, foam roll Wałek, kettlebells Kettlebell, machine Maszyna, medicine ball Piłka lekarska, other Inne. `equipmentLabel(e: string|null): string` → `'Brak'` for null.
  - `LEVEL_PL`: beginner Początkujący, intermediate Średnio zaawansowany, expert Zaawansowany. `muscleLabel(m: string): string` (falls back to the raw value).
- Produces in `exercises.ts`:
  - `EXERCISE_DB_VERSION = 1`, `IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'`, `imageUrl(path: string): string`.
  - `fromDb(raw: RawExercise): Exercise` (`custom: false`, missing `equipment` → `null`).
  - `seedExercises(load?: () => Promise<RawExercise[]>): Promise<void>` — if `settings.exerciseDbVersion === EXERCISE_DB_VERSION` and the table has any non-custom row, return; else `bulkPut` all mapped rows and `updateSettings({ exerciseDbVersion })`. Default `load` = `import('./exercise-db.json')`.
  - `filterExercises(list: Exercise[], f: { query?: string; muscle?: string|null; equipment?: string|null }): Exercise[]` — pure; query split on whitespace, every token must be a case-insensitive substring of the name (also match with `-`/`_` treated as spaces); muscle matches primary OR secondary; result sorted by name (`localeCompare`).
  - `getRecentExerciseIds(limit = 8): Promise<string[]>` — workouts by `startedAt` descending, collect `exerciseId`s from their sets in order of appearance, unique, up to `limit`.
  - `getTips(id: string): string[]` (from `tips-pl.json`, `[]` if none).
  - `saveNote(exerciseId: string, text: string): Promise<void>` — trimmed empty → delete row, else put `{exerciseId, text, updatedAt: Date.now()}`.
  - `type CustomExerciseInput = { name: string; primaryMuscles: string[]; secondaryMuscles: string[]; equipment: string|null }`
  - `createCustomExercise(input): Promise<Exercise>` (id `custom-${crypto.randomUUID()}`, `category: 'strength'`, `instructions: []`, `images: []`, `custom: true`; throws `Error('Podaj nazwę')` if name blank, `Error('Wybierz co najmniej jeden mięsień')` if no primary muscle).
  - `updateCustomExercise(id, input): Promise<void>` (same validation; throws if exercise is not custom).
  - `deleteCustomExercise(id): Promise<{ ok: true } | { ok: false; reason: string }>` — refuse with reason `'Ćwiczenie jest używane w planie lub historii treningów.'` if any `sets` row has this `exerciseId` or any plan day item does; otherwise delete the exercise and its note.

- [ ] **Step 1: Write failing tests** in `src/data/exercises.test.ts` (fake-indexeddb; `beforeEach` deletes/opens db; seed via injected loader with 3 sample raw exercises):
  - `seed wstawia ćwiczenia z bazy i zapisuje wersję` → count 3, `getSettings().exerciseDbVersion === 1`, `Barbell_Squat.custom === false`.
  - `drugi seed nie dubluje i nie rusza własnych ćwiczeń ani notatek` → create custom + note, run seed twice with version bumped via clearing settings → count 4, custom and note still there.
  - `filtr: wielkość liter, kolejność słów, myślniki` → query `"  PRESS bench "` finds `Barbell Bench Press - Medium Grip`; `"medium-grip"` finds it too.
  - `filtr mięśni obejmuje mięśnie pomocnicze; filtr sprzętu` → muscle `'triceps'` returns the bench press (secondary), equipment `'barbell'` excludes dumbbell items; results sorted by name.
  - `ostatnio używane: najnowszy trening pierwszy, bez powtórzeń, limit` → two workouts, sets → expected id order.
  - `notatka: zapis, nadpisanie, pusta usuwa`.
  - `własne ćwiczenie: walidacja nazwy i mięśni, tworzenie, edycja`.
  - `usuwanie własnego: odmowa gdy użyte w serii lub planie, inaczej usuwa też notatkę`.
- [ ] **Step 2:** Run `npx vitest run src/data/exercises.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement the interfaces above; `npm i dexie-react-hooks`.
- [ ] **Step 4:** Run `npx vitest run` → all PASS; `npx tsc -b` → no errors.
- [ ] **Step 5:** Commit `feat: exercise database seed and data helpers`.

### Task 2: Exercises list screen + image caching

**Files:**
- Modify: `src/pages/ExercisesPage.tsx`; Create: `src/pages/ExercisesPage.css`, `src/components/ExerciseThumb.tsx`, `src/components/FilterSheet.tsx`, `src/components/Sheet.css`
- Modify: `vite.config.ts` (workbox `runtimeCaching`)
- Test: `e2e/exercises.spec.ts` (add to the `mobile` project's `testMatch`)

**Interfaces:**
- Consumes: Task 1 (`filterExercises`, `getRecentExerciseIds`, labels, `imageUrl`), `db.exercises` via `useLiveQuery`.
- Produces: route `/cwiczenia` (list), links to `/cwiczenia/:id` (id `encodeURIComponent`), button „Nowe ćwiczenie” linking to `/cwiczenia/nowe`. `ExerciseThumb({ exercise, size })` — first image or a `Dumbbell` icon placeholder, also on `onError`.

Layout: `<h1>Ćwiczenia</h1>` + round „+” button (aria-label „Nowe ćwiczenie”); sticky search input (placeholder „Szukaj ćwiczenia”, `type="search"`, clear button); row of two filter buttons „Mięśnie” / „Sprzęt” (label becomes the chosen Polish value, accent style when active, „×” clears); a bottom sheet (`role="dialog"`, Polish title, option list with check mark, backdrop tap closes); section „Ostatnio używane” (only when not empty and no search/filter active); section with result count („876 ćwiczeń”) and the list. Row: 56 px thumbnail, name, Polish primary muscles + equipment in muted text, badge „Własne” for custom. Render at most 60 rows, then a „Pokaż więcej” button (+60) to keep the phone fast; reset on filter change. Loading state „Ładowanie bazy ćwiczeń…” until the table is non-empty.

Workbox: `runtimeCaching: [{ urlPattern: /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\//, handler: 'CacheFirst', options: { cacheName: 'exercise-images', expiration: { maxEntries: 2000, maxAgeSeconds: 31536000 }, cacheableResponse: { statuses: [200] } } }]`; add `json` to `globPatterns` is NOT needed (JSON is bundled into a JS chunk); raise `maximumFileSizeToCacheInBytes` to 3 MB so the exercise chunk is precached.

- [ ] **Step 1: Write failing e2e tests** `e2e/exercises.spec.ts`:
  - `lista pokazuje bazę 876 ćwiczeń` → open `/#/cwiczenia`, expect text `876 ćwiczeń`.
  - `wyszukiwanie zawęża listę` → type `barbell squat` → link „Barbell Squat” visible, „Dumbbell Bicep Curl” not.
  - `filtr Mięśnie i Sprzęt` → Mięśnie → „Łydki”, Sprzęt → „Maszyna” → every row's meta text contains „Maszyna”; button shows „Łydki”; „×” clears.
  - `wiersz ma co najmniej 44 px`.
- [ ] **Step 2:** `npx playwright test e2e/exercises.spec.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Playwright + `npx vitest run` + `npx tsc -b` PASS.
- [ ] **Step 5:** Commit `feat: exercises list with search and filters`.

### Task 3: Exercise card + custom exercise form

**Files:**
- Create: `src/pages/ExerciseDetailPage.tsx`, `src/pages/ExerciseDetailPage.css`, `src/pages/ExerciseFormPage.tsx`, `src/pages/ExerciseFormPage.css`
- Modify: `src/App.tsx` (routes `/cwiczenia/nowe`, `/cwiczenia/:id`, `/cwiczenia/:id/edytuj` — `nowe` before `:id`)
- Test: extend `e2e/exercises.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`getTips`, `saveNote`, `createCustomExercise`, `updateCustomExercise`, `deleteCustomExercise`, labels, `imageUrl`), Task 2 `ExerciseThumb`.

Card: back button („Wróć”, `navigate(-1)` or `/cwiczenia`), name as `<h1>`; photos in a horizontal scroll-snap strip (both upstream images, `crossOrigin="anonymous"`, 4:3, placeholder on error; custom → no strip); chips: primary muscles (accent), secondary (muted), equipment, level; section „Rady” (bulleted, only when tips exist); section „Twoja notatka” — textarea (aria-label „Notatka”), saved with 400 ms debounce and on blur, small „Zapisano” confirmation; section „Instrukcja” (numbered, English; hidden when empty); for custom: buttons „Edytuj” and „Usuń” (confirm sheet „Usunąć ćwiczenie?”; on refusal show the returned reason). Unknown id → „Nie znaleziono ćwiczenia” + link back.

Form (`/cwiczenia/nowe` title „Nowe ćwiczenie”, edit title „Edytuj ćwiczenie”): name input („Nazwa”), multi-select chips „Mięśnie główne” and „Mięśnie pomocnicze” (17 Polish labels), single-select chips „Sprzęt” (incl. „Brak”), textarea „Notatka” (saved via `saveNote`), button „Zapisz” (validation error shown in Polish from the thrown message), „Anuluj”. After create → `navigate('/cwiczenia/<id>', { replace: true })`.

- [ ] **Step 1: Write failing e2e tests:**
  - `karta ćwiczenia: zdjęcia, rady, mięśnie` → open `/#/cwiczenia/Barbell_Squat` → h1 „Barbell Squat”, 2 images with src starting with IMAGE_BASE, heading „Rady” visible, chip „Czworogłowe ud”.
  - `notatka zapisuje się i przetrwa przeładowanie` → type „Ławka na 30°”, wait for „Zapisano”, reload → textarea has the text.
  - `własne ćwiczenie: utwórz, edytuj, usuń` → „+” → Zapisz empty → „Podaj nazwę”; fill „Wiosło Krzywe”, chip „Środek pleców”, Sprzęt „Sztanga”, Zapisz → card h1 „Wiosło Krzywe” + „Własne”; Edytuj → rename „Wiosło krzywą sztangą” → Zapisz → h1 updated; Usuń → confirm → back on list, search finds nothing.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** All tests + `tsc` + `npm run lint` PASS.
- [ ] **Step 5:** Commit `feat: exercise card, notes and custom exercises`.

### Task 4: Polish tips for ~40 common exercises (main session)

**Files:** Modify `src/data/tips-pl.json`; Test: add to `src/data/exercises.test.ts`.

- [ ] **Step 1: Test** `rady: każdy klucz istnieje w bazie i ma 2–5 rad` → for every key of `tips-pl.json`, id exists in `exercise-db.json`, array length 2–5, each tip non-empty; at least 40 keys; `getTips('Barbell_Squat').length > 0`.
- [ ] **Step 2:** Write tips (short, concrete: bench angle, grip width, elbows, range of motion, breathing, common mistakes) for the big lifts and common machine/cable/dumbbell exercises.
- [ ] **Step 3:** `npx vitest run` PASS.
- [ ] **Step 4:** Commit `feat: Polish tips for 40+ exercises`.

### Task 5: Verify and ship (main session)

- [ ] Full `npx vitest run`, `npx playwright test`, `npm run build`, `npm run lint`.
- [ ] Preview `gym-app` at phone size: list, filters, card, note, custom flow; screenshot.
- [ ] Push to `main`, wait for the Pages deploy, open https://repcak135.github.io/gym-app/#/cwiczenia and check the list and a card load.
