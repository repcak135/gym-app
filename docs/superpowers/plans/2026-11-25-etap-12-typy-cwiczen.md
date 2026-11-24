# Etap 12 — superserie, ćwiczenia na czas i dystans, generator rozgrzewki — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group 2–3 exercises into a superset/circuit (alternate sets, one rest after the round), log timed holds (plank) and distance/cardio exercises with a stopwatch, and generate warm-up ramp sets from the first working weight.

**Architecture:** New optional, unindexed fields only (no Dexie schema change): `Exercise.measure`, `WorkoutSet.durationSec/distanceM`, `PlanItem/WorkoutExercise.targetSec/targetM/group`. Built-in measure comes from openGym catalogue flags (`hold: true` → time, `track: "distance"` → distance, category cardio → timeDistance) via a generated `src/data/exercise-measure.json`, applied on reseed (exercise DB version 5). Pure logic in `src/data/measure.ts`, `src/data/supersets.ts`, `src/data/warmup.ts`.

**Tech Stack:** React 19, TypeScript, Dexie 4, Vitest, Playwright.

**Spec:** task brief (part 2) + `docs/superpowers/specs/2026-11-22-gym-app-design.md`.

## Global Constraints

- "Nic nie popsuj": no Dexie version bump; existing sets (no duration/distance) behave exactly as now; reseed keeps user-set `weightStep`/`barWeight` and the new `measure` override.
- Polish UI, decimal comma, phone width 375 px.
- Plan share links (`planShare.ts`, payload `v: 1`) must stay decodable: new fields optional; old links still import; new links with new fields decode in this version.
- Backup/restore carries the new fields automatically (whole rows) — verify with a test.
- Release: bump to next 0.9.x + Polish changelog entry.

## Review Focus

- A superset where one exercise has fewer sets than the other: when it runs out, the round continues with the remaining exercise(s) only, rest after each of those sets.
- Removing/moving one exercise of a superset during a workout: the moved/removed one leaves the group; a group left with 1 exercise dissolves.
- Timed set with no stopwatch use (typed duration) and set completed with duration 0: allowed, records ignore 0.
- Warm-up generator when working weight ≤ bar weight, or weight 0, or a dumbbell exercise (no bar): sensible output or the button hidden.
- Old shared plan link (no group/target fields) imports unchanged.

---

### Task 1: Measure types (data, records, stats, card)

**Files:** Create `scripts/build-measure.ts`, `src/data/exercise-measure.json`, `src/data/measure.ts` (+ test). Modify `src/data/types.ts`, `src/data/exercises.ts` (fromDb + reseed keeps override; `EXERCISE_DB_VERSION = 5`), `src/data/records.ts`, `src/data/exerciseHistory.ts`, `src/data/progression.ts` (`formatSetShort`), `src/data/report.ts`/`reportXlsx.ts`, `src/pages/ExerciseDetailPage.tsx` (choice for built-ins), `src/pages/ExerciseFormPage.tsx` (custom), tests.

**Interfaces (Produces):**
```ts
export type Measure = 'reps' | 'time' | 'distance' | 'timeDistance';
// Exercise += measure?: Measure (built-in default from JSON; undefined = 'reps'), measureOverride?: Measure (user choice, kept on reseed)
// WorkoutSet += durationSec?: number; distanceM?: number
// PlanItem, WorkoutExercise += targetSec?: number; targetM?: number
export function measureOf(ex: Pick<Exercise,'measure'|'measureOverride'> | undefined): Measure;
export function formatDuration(sec: number): string;          // 45 → "0:45", 90 → "1:30", 3725 → "1:02:05"
export function formatDistance(m: number, measure: Measure): string; // distance: "40 m"; timeDistance: "2,5 km" (≥1000 m), "800 m"
export function parseDuration(text: string): number | null;   // "45" → 45, "1:30" → 90, "1:02:05" → 3725
export const MEASURE_OPTIONS: { value: Measure; label: string }[]; // Powtórzenia, Czas (np. deska), Dystans (np. spacer farmera), Czas i dystans (cardio)
```
- `scripts/build-measure.ts <openGym checkout>` writes `{ time: string[], distance: string[], timeDistance: string[] }` of OUR ids: og id `og-<id>` if it exists in our catalogue (`exercises-og.json` added + merged map → follow `merged` to the kept id); free-exercise-db ids with category `cardio` → timeDistance; free-exercise-db names matching /plank|wall sit|dead hang|l-sit|hollow (body )?hold/i → time. A precomputed openGym list is at `C:/Users/repca/AppData/Local/Temp/claude/b0147d3e513e77ed/ea080c0a-857d-4e0d-b64d-f305fbf54d92/scratchpad/og-measure.json` (`{hold:[[id,name]],distance:[...],cardio:[...]}`); the script may read either.
- Records (`computeRecords`): add `longestTime?: {sec, at}` and `longestDistance?: {m, at}`; weight/e1rm/volume records keep ignoring sets with reps 0 (time/distance sets store reps 0). Exercise history rows/`formatSetShort` show `0:45` / `20 kg · 0:45` / `40 m` / `25:00 · 5 km`.
- Stats: set counts include completed time/distance sets; volume adds weight×reps only (unchanged formula).
- Report (CSV/xlsx): add columns `Czas` (m:ss) and `Dystans (m)` — empty for reps sets.
- Card (built-in): "Rodzaj ćwiczenia" select → `measureOverride`; custom form: same select → `measure`.

- [ ] Tests first: `measure.test.ts` (format/parse cases above, `measureOf` defaults), `records` test with a time history (longestTime), `exercises.test.ts` reseed keeps `measureOverride` and applies JSON measure, backup round-trip keeps `durationSec`. Run → FAIL. Implement. `npx vitest run` + `npx tsc -b` → PASS. Commit `feat: exercise measure types (time, distance, cardio) in data, records and card`.

### Task 2: Warm-up generator

**Files:** Create `src/data/warmup.ts` (+ test), `src/components/workout/WarmupSheet.tsx`. Modify `src/data/workouts.ts` (`replaceWarmups`), `src/components/workout/ExercisePanel.tsx`, CSS, `e2e/workout.spec.ts`.

**Interfaces:**
```ts
export function warmupRamp(opts: { work: number; bar: number | null; plates: number[]; step: number }): { weight: number; reps: number }[];
export async function replaceWarmups(workoutId: string, exerciseId: string, ramp: { weight: number; reps: number }[]): Promise<void>;
```
- With a bar (equipment barbell / e-z curl bar; bar = exercise.barWeight ?? settings.barWeight): steps `bar×10`, `40%×8`, `60%×5`, `80%×3`; each % weight rounded DOWN to a loadable weight (bar + pairs of available plates, use `calculatePlates`) ; drop a step whose weight ≤ previous step's weight or ≥ work. Without a bar: `40%×8`, `60%×5`, `80%×3` rounded down to the step, drop ≤ 0 / duplicates / ≥ work. work ≤ 0 → [].
- `replaceWarmups`: one transaction: delete NOT completed warm-ups of the exercise, insert the ramp as warm-ups before the first working set (renumber setOrder of that exercise), set `WorkoutExercise.warmupSets` = completed warm-ups + ramp length.
- UI: in ExercisePanel next to "+ Seria" a button `Rozgrzewka` (hidden for measure ≠ reps and when the first working set's weight is 0) → `WarmupSheet` (title `Rozgrzewka przed {weight} kg`, list of proposed sets, short text `Lekkie serie przed właściwymi — rozgrzewają mięśnie i stawy, nie męczą.`, buttons `Dodaj rozgrzewkę` / `Anuluj`).
- [ ] Tests: `warmupRamp({work:100,bar:20,plates:[25,20,15,10,5,2.5,1.25],step:2.5})` → `[20×10, 40×8, 60×5, 80×3]`; work 30 bar 20 → `[20×10]` (12 and 18 drop); dumbbell work 20 step 2 → `[8×8, 12×5, 16×3]`; work 0 → []. `replaceWarmups` keeps a completed warm-up and working sets. e2e: tap `Rozgrzewka` → sheet → `Dodaj rozgrzewkę` → rows R1… appear before set 1. Commit `feat: warm-up generator`.

### Task 3: Timed and distance sets in the live workout and plans

**Files:** Modify `src/components/workout/ExercisePanel.tsx` (editor variants), create `src/components/workout/Stopwatch.tsx`, `src/data/workouts.ts` (prefill + `updateSet` accepts `durationSec`/`distanceM`), `src/data/setTargets.ts` (time targets), `src/pages/PlanDayPage.tsx` (item editor: target seconds / metres instead of reps when measure ≠ reps), `src/data/plans.ts` (`formatReps`-like `formatTarget(item, measure)`), history views, e2e.
- Editor by measure: time → `Czas` field (m:ss, ±5 s steppers, `parseDuration`) + `Ciężar (kg)` (optional, may stay 0) + Stopwatch; distance → `Dystans (m)` (±5 m) + `Ciężar (kg)`; timeDistance → `Czas` (±30 s) + `Dystans (km)` (±0,1 km, stored in m) + Stopwatch.
- Stopwatch: `Start` counts up from 0 (mm:ss, big digits, uses Date.now() deltas so it survives background); when the set has a target (`targetSec`) it shows `cel 0:45` and plays the chosen rest-end preset (`playAlarmNow(settings.restSoundPreset)` / vibration) once when the target is reached, keeps counting; `Stop` writes the elapsed seconds into the set's `durationSec`. Wake lock already active in the workout.
- Prefill/targets: time → last duration per set +5 s (text `Ostatnio 0:40 — spróbuj 0:45`), first time uses `targetSec ?? 30`; distance/timeDistance → copy last values (text `Jak ostatnio`), first time `targetM` / empty.
- Plan day item editor: for time → `Cel (s)` select 15–300 step 15 (default 30); distance → `Cel (m)` 10–1000; timeDistance → `Cel (min)` + optional km. Reps fields hidden. `startWorkout` copies targetSec/targetM.
- [ ] Tests: unit for time targets and `formatTarget`; e2e: plan with Plank (built-in time exercise) → set editor shows `Czas`, Start/Stop stores a duration > 0 (use `page.clock` if available, else wait ~1.2 s), completed row shows `0:01`; cardio exercise shows km. Commit `feat: timed and distance sets with stopwatch`.

### Task 4: Supersets and circuits

**Files:** Create `src/data/supersets.ts` (+ test). Modify `src/data/types.ts`, `src/data/plans.ts` (`linkWithNext(planId, dayId, index)`, `unlinkItem`), `src/pages/PlanDayPage.tsx`, `src/data/workouts.ts` (startWorkout copies `group`; `completeSet` rest only at round end; `linkExercises`/`unlinkExercise`; `moveExercise`/`removeExercise` drop the item from its group and dissolve 1-item groups), `src/pages/WorkoutPage.tsx` (pager jump within a group, list view bracket, menu entries), `src/components/workout/ExercisePanel.tsx` (group chip), `src/data/planShare.ts` (encode/decode `group`, `targetSec`, `targetM` as optional), e2e.

**Interfaces:**
```ts
// PlanItem, WorkoutExercise += group?: string  (consecutive items with equal group = one superset; 2 = "Superseria", 3 = "Obwód")
export function groupsOf(items: { group?: string }[]): { start: number; end: number }[]; // only groups of ≥ 2 consecutive items
export function groupLabel(size: number): 'Superseria' | 'Obwód';
export function nextInRound(items: { group?: string }[], remaining: number[], index: number): { next: number | null; endOfRound: boolean };
// remaining[i] = not completed sets of item i. next = next item in the group (cyclic, after index) with remaining > 0, or null when none.
// endOfRound = true when index is the last item of its group that still has sets in this round (or not grouped).
```
- Max 3 per group: `linkWithNext` refuses when the result would exceed 3 (UI hides the option).
- `completeSet`: if the exercise is grouped and not endOfRound → no rest (`restEndsAt` cleared); else rest = that exercise's `restSec` (the last in the round). WorkoutPage after completing a set in a group: jump pager to `next` (the existing auto-advance setting applies only when the whole group is done).
- Plan day screen: grouped items drawn with a left accent bar and a header `Superseria` / `Obwód` + hint `Robisz po jednej serii z każdego ćwiczenia, przerwa po rundzie`; item menu: `Połącz z następnym` / `Odłącz z superserii`. Workout list view: same bracket; menu "Opcje treningu": `Połącz z następnym w superserię` / `Odłącz z superserii`. Panel chip: `Superseria 1/2 · dalej: {name}`.
- [ ] Tests: `nextInRound` (A,B grouped; A done → next B no rest; B → next A, endOfRound; B out of sets → A rests each set); `linkWithNext` limit; planShare round-trip with group + an old payload without; e2e: plan day link two exercises → start → complete set of A → pager shows B and no rest bar; complete B → rest bar shows. Commit `feat: supersets and circuits`.

### Task 5: Release (main session)

- [ ] Version 0.9.x + changelog: superserie i obwody, ćwiczenia na czas (deska) i dystans/cardio ze stoperem, automatyczna rozgrzewka.
- [ ] Full vitest + playwright + build; phone check 375×812; commit; push; confirm deploy.
