# Etap 11 — progresja per seria i komfort treningu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-set targets with a plain-language reason, an effort-target setting that reads logged RPE, a stagnation hint with "Zastosuj −10%", reordering exercises during a live workout, and rest-end sound presets.

**Architecture:** Pure logic in new `src/data/setTargets.ts` (targets, effort, stagnation) used both by the prefill in `workouts.ts` and by `ExercisePanel` (reason line). Reorder = one Dexie transaction in `workouts.ts` + a new `PlanChange` kind `order`. Sounds = presets dispatched in `src/audio/beep.ts`. New settings fields are unindexed, filled by `getSettings()` defaults: **no Dexie schema change**.

**Tech Stack:** React 19, TypeScript, Dexie 4, Vitest, Playwright, Web Audio.

**Spec:** `docs/superpowers/specs/2026-11-22-gym-app-design.md` + owner decisions in memory `gym-app.md` (session B scope, 2026-11-24).

## Global Constraints

- "Nic nie popsuj": no Dexie version bump; old settings rows must keep working (`getSettings()` spreads defaults).
- All UI copy in Polish, no jargon in UI ("double progression", "RIR" never shown in the hint texts; RPE only where it already is).
- Decimal comma in kg (`formatKg`).
- Rep drop-off between sets is normal: never equalize sets.
- iPhone: the alarm keeps the current `playAlarmNow` mechanism (audioSession 'playback' for ~1 s, then 'auto').
- Every user-visible release: bump `package.json` version (0.9.x) + Polish entry in `src/data/changelog.ts`.
- Unit tests `npx vitest run`, e2e `npx playwright test`, build `npm run build` all green before push.

## Review Focus

- Exercise with weight 0 (bodyweight): reaching the top must not suggest "+2,5 kg" from 0 → +1 rep instead.
- Workout has more working sets than last time: extra sets copy the last set's target (reason "Jak poprzednia seria").
- Last session's set below repsMin (e.g. 5 in 8–12): same weight, +1 rep, no weight increase.
- Reordering while a rest timer runs / with completed sets: sets keep their completedAt; currentIndex follows the exercise being shown.
- Old settings row with `restSound: false` and no preset → preset `silent` (user who muted keeps silence).

---

### Task 1: Per-set targets, effort, stagnation (data layer)

**Files:**
- Create: `src/data/setTargets.ts`, `src/data/setTargets.test.ts`
- Modify: `src/data/types.ts` (AppSettings), `src/data/settings.ts` (default), `src/data/workouts.ts` (`prefilledSets`, new `scaleWorkingWeights`)
- Test: `src/data/workouts` tests (existing file that covers prefill, e.g. `src/data/db.test.ts` or the workouts test — find with grep `prefill`/`startWorkout`)

**Interfaces (Produces):**
```ts
export type EffortTarget = 'failure' | 'close' | 'reserve';     // AppSettings.effortTarget, default 'close'
export type TargetReason = 'none' | 'reps' | 'easy' | 'top' | 'hard' | 'below' | 'copy';
export interface SetTarget { weight: number; reps: number; reason: TargetReason; text: string }
export function setTargets(opts: {
  lastWorking: { weight: number; reps: number; rir?: number }[]; // last session's working sets, in order
  count: number;            // working sets planned now
  repsMin: number; repsMax: number; step: number; effort: EffortTarget;
}): SetTarget[];            // length === count; [] when lastWorking is empty
export function effortOf(rir: number | undefined, effort: EffortTarget): 'easy' | 'ok' | 'hard' | 'unknown';
export function isStagnating(sessions: { weight: number; reps: number }[][]): boolean; // newest first, working sets only
export function deloadWeight(weight: number, step: number): number; // −10 %, rounded DOWN to a multiple of step, ≥ 0
export const EFFORT_OPTIONS: { value: EffortTarget; label: string; hint: string }[];
```
`workouts.ts` adds `scaleWorkingWeights(workoutId: string, exerciseId: string, step: number): Promise<void>` — applies `deloadWeight` to every not-completed working set of that exercise.

Rules (set i uses last working set `r = lastWorking[min(i, len-1)]`; for i ≥ len reason is `copy`, values = target computed for the last set):
- effort bands (RIR in reserve): failure 0–0, close 1–2, reserve 2–3. `effortOf`: undefined → unknown; rir ≥ bandHigh + 2 → easy; rir < bandLow → hard; else ok.
- hard (and r.reps ≥ repsMin) → same weight & reps, reason `hard`, text `Było ciężej niż chcesz — powtórz to samo`.
- r.reps < repsMin → same weight, reps r.reps+1, reason `below`, text `Ostatnio {n} — poniżej zakresu, dorzuć 1`.
- r.reps ≥ repsMax and r.weight > 0 → weight r.weight+step, reps repsMin, reason `top`, text `Ostatnio {n}, czyli górna granica — weź {step} kg więcej i zacznij od {repsMin}`.
- r.reps ≥ repsMax and r.weight === 0 → reps r.reps+1, reason `reps`, text `Ostatnio {n} — dorzuć 1`.
- easy → reps r.reps+2; if that exceeds repsMax and weight > 0 → top rule instead (reason `easy`, text `Ostatnio {n} i było lekko — weź {step} kg więcej i zacznij od {repsMin}`); else text `Ostatnio {n} i było lekko — dorzuć 2`.
- otherwise (ok/unknown) → reps r.reps+1 (cap repsMax), reason `reps`, text `Ostatnio {n} powtórzeń — dorzuć 1`.
- copy text: `Jak poprzednia seria`.
- Numbers in text via `formatKg`; Polish plural for "powtórzenie" not needed in these fixed forms except "powtórzeń" (use as given).
- `isStagnating`: needs ≥ 4 sessions; true when for each of the 3 newest sessions, no working set index i has (weight > previous session's set i weight) or (same weight and more reps); sets compared by index, missing index = no progress.

- [ ] **Step 1: Write failing tests** in `src/data/setTargets.test.ts`:
  - `30×9, 8–12, close, no rir` → `{weight:30, reps:10, reason:'reps', text:'Ostatnio 9 powtórzeń — dorzuć 1'}`.
  - per-set independence: last `[32.5×12, 32.5×10, 32.5×8]` 8–12 step 2.5 → `[35×8 top, 32.5×11 reps, 32.5×9 reps]`; text of set 1 `'Ostatnio 12, czyli górna granica — weź 2,5 kg więcej i zacznij od 8'`.
  - rir 0 with effort close → hard, same values; rir 0 with effort failure → reps (+1).
  - rir 5 with effort close at 30×10 (8–12) → easy, reps 12; at 30×11 → easy top, 32,5×8.
  - weight 0 ×12 (8–12) → 0×13 reason reps.
  - 30×5 (8–12) → 30×6 below.
  - count 4, last 3 sets → 4th is copy of 3rd's target.
  - `isStagnating`: 4 identical sessions → true; 3 sessions → false; one set +1 rep in the newest → false.
  - `deloadWeight(62.5, 2.5)` → 55; `deloadWeight(20, 2.5)` → 17.5; `deloadWeight(0, 2.5)` → 0.
  - `effortOf(undefined,'close')` → 'unknown'.
- [ ] **Step 2:** `npx vitest run src/data/setTargets.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `setTargets.ts`; add `effortTarget: EffortTarget` to `AppSettings` (+ doc comment) and `effortTarget: 'close'` to `DEFAULT_SETTINGS`. `EFFORT_OPTIONS` labels: `Do upadku` (hint `RPE 10 — do ostatniego powtórzenia`), `Blisko upadku — 1–2 w zapasie` (hint `RPE 8–9, polecane`), `Z zapasem — 2–3 w zapasie` (hint `RPE 7–8`).
- [ ] **Step 4:** In `workouts.ts` `prefilledSets`: working sets = `setTargets(...)` values (weight, reps) using the exercise's step and `settings.effortTarget`; warm-ups unchanged (`buildPrefill`). Remove the old `suggestProgression` 'increase' override. Keep `suggestProgression` exported (other users? grep; delete only if unused after Task 2). Add `scaleWorkingWeights`. Add a test that `startWorkout` from a plan prefills per-set targets after a finished workout `[30×12, 30×10]` → `[32,5×8, 30×11]`.
- [ ] **Step 5:** `npx vitest run` → all PASS. `npx tsc -b` clean.
- [ ] **Step 6: Commit** `feat: per-set progression targets with effort target (data)` — stage files by name.

### Task 2: Reason line, help sheet, stagnation hint, effort setting (UI)

**Files:**
- Create: `src/components/workout/ProgressionHelpSheet.tsx`
- Modify: `src/components/workout/ExercisePanel.tsx`, `src/pages/WorkoutPage.tsx` (pass `recentSessions` + `effort`), `src/pages/SettingsPage.tsx`, related CSS, `e2e/workout.spec.ts`

**Interfaces:** Consumes Task 1 (`setTargets`, `isStagnating`, `scaleWorkingWeights`, `EFFORT_OPTIONS`, `getExerciseHistory`).

- ExercisePanel: drop the old `progressionText` paragraph and "Użyj X kg" button. Keep `Ostatnio: …`. For the selected **working, not completed** set at working index i, show under the editor title a reason line (`set-editor__reason`) with `targets[i].text` and a round "?" button (`aria-label="Jak działa podpowiedź?"`) opening `ProgressionHelpSheet`. Targets computed with `setTargets` from `lastSets` working sets, `count` = current working sets, `effort` prop.
- WorkoutPage loads per exercise once (like `lastSets`) the 4 newest finished sessions (`getExerciseHistory(id, workout.id).slice(0,4)`, working sets) and passes `stagnating: boolean` to ExercisePanel.
- Stagnation hint (only when `stagnating` and no working set of this exercise is completed yet and not yet applied in this render session): box `3 treningi bez postępu — rozważ zejście o ok. 10% i zbudowanie od nowa` + button `Zastosuj −10%` → `scaleWorkingWeights`, then box text `Ciężar zmniejszony o ok. 10% na ten trening`. Workout-only: plan untouched.
- ProgressionHelpSheet (same sheet pattern as other sheets, `role="dialog"`, title `Jak działa podpowiedź?`). Own wording, e.g.: każda seria ma swój cel; jeśli ostatnio zrobiłeś w serii mniej niż górna granica zakresu, dorzuć jedno powtórzenie; gdy seria dojdzie do górnej granicy, następnym razem weź trochę więcej kg i zacznij od dołu zakresu; kolejne serie mogą mieć mniej powtórzeń — to normalne. Example for range 8–12: `Seria 1: 30 kg × 12 → następnym razem 32,5 kg × 8`, `Seria 2: 30 kg × 10 → 30 kg × 11`, `Seria 3: 30 kg × 9 → 30 kg × 10`. One paragraph about "Jak ciężko trenujesz?" (Ustawienia) and that a too-hard set means repeating the same. One about the 3-trainings-without-progress hint.
- Settings: new group `Jak ciężko trenujesz?` (after "Nowe ćwiczenie w planie") with 3 radio options from `EFFORT_OPTIONS` + one-line note `Jeśli oceniasz trudność serii, podpowiedź porówna ją z tym celem.`

- [ ] **Step 1:** e2e test in `e2e/workout.spec.ts`: seed a finished workout with `[30×12, 30×10]` for an exercise in a plan day (follow existing seeding helpers), start that day → first set prefilled `32,5`/`8`, reason text contains `górna granica`; tap "Jak działa podpowiedź?" → dialog visible. Second test: seed 4 identical sessions → text `3 treningi bez postępu` visible, click `Zastosuj −10%` → set weight reduced.
- [ ] **Step 2:** Run it → FAIL.
- [ ] **Step 3:** Implement UI pieces above.
- [ ] **Step 4:** `npx playwright test e2e/workout.spec.ts` + `npx vitest run` → PASS; fix older e2e expecting `Spróbuj`/`Użyj` texts.
- [ ] **Step 5: Commit** `feat: per-set reason line, help sheet, stagnation hint, effort setting`.

### Task 3: Reorder exercises during a workout

**Files:**
- Modify: `src/data/workouts.ts` (`moveExercise`), `src/data/planSync.ts` (kind `order`), `src/pages/WorkoutPage.tsx` (+ CSS), `src/pages/WorkoutSummaryPage.tsx` (`describeChange`)
- Test: workouts/planSync unit tests, `e2e/workout-list.spec.ts`

**Interfaces:**
```ts
export async function moveExercise(workoutId: string, from: number, to: number): Promise<void>;
// PlanChange += { kind: 'order'; order: string[] }  // workout's exercise ids in new order
```
- `moveExercise`: one transaction; splice `exercises`; rewrite `exerciseOrder` of every set of the workout to the new index of its exerciseId; `currentIndex` keeps pointing to the same exercise it pointed to before. Out-of-range / same index → no-op.
- `diffWorkoutVsPlan`: map plan ids through accepted-swap pairs (from→to), take plan ids present in the workout and workout ids present in (mapped) plan; if the two sequences differ → push `{kind:'order', order: w.exercises.map(e=>e.exerciseId)}` (last in the list).
- `applyPlanChanges`: after adds, if an `order` change is present: the slots occupied by items whose id is in `order` are refilled with those items sorted by their index in `order`; other items keep their slots.
- Summary label: `Kolejność ćwiczeń: A → B → C` (names, use existing name lookup; include `order` ids in the ids list).
- UI list view: each row gets a drag handle (`aria-label="Przeciągnij, aby zmienić kolejność"`, GripVertical icon) using pointer events (setPointerCapture, translateY the dragged row, compute target from row midpoints, call `moveExercise` on drop; `touch-action: none` on the handle). Menu (`Opcje treningu`): `Przesuń wyżej: {name}` / `Przesuń niżej: {name}` when possible; after moving, the pager shows the moved exercise (setIndex to new position and scroll pager).

- [ ] **Step 1:** Unit tests: move 0→2 of [A,B,C] → [B,C,A], sets' exerciseOrder updated, currentIndex (was 0 = A) → 2; diff returns `order` when the workout order differs; apply with a non-workout item kept in its slot: plan [A,X,B,C], order [C,A,B] → [C,X,A,B].
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement data. **Step 4:** Run → PASS.
- [ ] **Step 5:** e2e in `e2e/workout-list.spec.ts`: menu "Przesuń niżej" moves the first exercise to 2nd place (list order checked); drag handle via `page.mouse` drag moves the last row to the top.
- [ ] **Step 6:** Implement UI, run all tests → PASS. **Step 7: Commit** `feat: reorder exercises during a workout + plan order change`.

### Task 4: Rest-end sound presets

**Files:**
- Modify: `src/audio/beep.ts`, `src/data/types.ts`, `src/data/settings.ts`, `src/components/workout/RestBar.tsx`, `src/pages/WorkoutPage.tsx` (props), `src/pages/SettingsPage.tsx`
- Test: `src/data/settings.test.ts`, `e2e/workout.spec.ts` or a settings e2e

**Interfaces:**
```ts
export type RestSoundPreset = 'bell' | 'gong' | 'twoTones' | 'beeps' | 'vibrate' | 'silent';
// AppSettings += restSoundPreset: RestSoundPreset (default 'bell'), restTicks: boolean (default true)
export const REST_SOUND_PRESETS: { value: RestSoundPreset; label: string }[];
// labels: Delikatny dzwonek, Gong, Dwa krótkie tony, Piknięcia (dawne), Tylko wibracja, Cisza (tylko napis)
export function scheduleRestSound(endMs: number, ticks: boolean, preset: RestSoundPreset): void;
export async function playAlarmNow(preset: RestSoundPreset): Promise<void>;
export async function previewSound(preset: RestSoundPreset): Promise<void>; // unlockAudio + play now (iOS via playback session like playAlarmNow)
```
- Presets synthesized: bell = sine partials (e.g. 1046 Hz + 2.76× overtone) with ~1.2 s exponential decay, played twice 0.45 s apart, moderate volume; gong = low sine ~110 Hz + inharmonic partials, ~2 s decay; twoTones = two sine tones 660→880, 0.18 s each; beeps = current `alarmAt`. vibrate/silent = no sound. Keep total ≤ ~2 s; extend the iOS `restoreTimer` to cover the longest preset (e.g. 2300 ms).
- `getSettings()`: if stored row has no `restSoundPreset` and `restSound === false` → `'silent'`. `restSound` stays in the type (old backups) but UI no longer shows it; RestBar plays sound iff preset is not vibrate/silent; vibration iff `restVibration` or preset `vibrate`. Ticks iff `restTicks` and preset not silent/vibrate.
- Settings "Koniec przerwy": radio list of presets, each row with a `Posłuchaj` button (`aria-label="Posłuchaj: {label}"`, hidden for vibrate/silent); toggle `Odliczanie 3-2-1 (ciche tyknięcia)`; existing Wibracja toggle; keep the explanatory note (add: `Tylko wibracja działa na Androidzie; iPhone pokaże sam napis.`).

- [ ] **Step 1:** Unit tests: `getSettings()` with stored `{restSound:false}` → preset 'silent'; with no row → 'bell', restTicks true.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** e2e: Ustawienia shows `Delikatny dzwonek` checked by default; choosing `Gong` persists after reload; `Posłuchaj: Gong` button exists and clicking does not throw (no console errors).
- [ ] **Step 5:** All tests PASS. **Commit** `feat: rest-end sound presets with preview and 3-2-1 toggle`.

### Task 5: Release 0.9.1 (main session)

- [ ] Bump `package.json` version to next 0.9.x; Polish changelog entry in `src/data/changelog.ts` (format as existing entries): podpowiedź dla każdej serii osobno z wyjaśnieniem i „?”, ustawienie „Jak ciężko trenujesz?”, podpowiedź przy 3 treningach bez postępu, zmiana kolejności ćwiczeń w trakcie treningu, nowe dźwięki końca przerwy.
- [ ] `npx vitest run`, `npx playwright test`, `npm run build` green; phone-size check (375×812) of workout panel, help sheet, list drag, Ustawienia; commit; push; confirm the Actions deploy succeeded (`gh run watch`); check live site shows new version.
