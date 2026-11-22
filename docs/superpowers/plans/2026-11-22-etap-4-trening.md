# Etap 4 (Trening na żywo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live workout: start from the active plan's next day or empty, log sets (weight/reps/warm-up, "Zalicz serię"), prefill + progression hint, rest timer, per-exercise History/Notes/Statistics, add/swap/remove exercise, wake lock, crash-proof resume, finish summary with records.

**Architecture:** Pure maths in `src/data/progression.ts` (no Dexie). All workout mutations in `src/data/workouts.ts`; every user action is one Dexie write, so closing the app at any moment loses nothing. The live state (exercise list, current exercise, rest end time) lives on the `Workout` row itself; planned-but-not-done sets are real `WorkoutSet` rows without `completedAt`. UI reads with `useLiveQuery`. Timers are computed from timestamps (`Date.now()`), never from tick counts.

**Tech Stack:** React 19, react-router 8 (HashRouter), Dexie 4 + dexie-react-hooks, lucide-react, Vitest + fake-indexeddb, Playwright (project `mobile`, iPhone 13). Chart = small inline SVG (no new dependency).

**Spec:** `docs/superpowers/specs/2026-11-22-gym-app-design.md` (sections "3. Trening na żywo", "5. Rekordy" for record definitions, "Ustalenia po przeglądzie" — progression rule, "Anty-cele")

## Global Constraints

- Polish UI; exercise names in English. Numbers with comma decimals (`37,5 kg`).
- Dark tokens from `src/theme/tokens.css`; completed sets use `--success`; touch targets ≥ 44 px, main actions ≥ 52 px.
- Every full-screen view pads top with `env(safe-area-inset-top)` and bottom with `env(safe-area-inset-bottom)` (iOS status bar is black-translucent).
- Bottom nav hidden on `/trening*` routes.
- Weight step = `exercise.weightStep ?? settings.defaultWeightStep` (default 2,5 kg). Rest = plan item `restSec`, else `settings.defaultRestSec` (120 s).
- Warm-up sets never count to volume, set counts, records or statistics.
- Double progression (verbatim from spec): "jeśli w ostatnim treningu wszystkie serie robocze osiągnęły górną granicę zakresu powtórzeń → podpowiedź „+ krok ciężaru”; w przeciwnym razie ten sam ciężar i „spróbuj +1 powtórzenie”. Serie niezaliczone (poniżej dolnej granicy) nigdy nie podnoszą ciężaru. Podpowiedź to tylko sugestia, nie zmienia planu."
- 1RM = Epley: `w × (1 + r/30)`, `r = 1 → w`, `r = 0 → 0`.
- Only one unfinished workout at a time (`source: 'app'`, no `endedAt`).
- No data loss: no action deletes a completed set without an explicit confirm.

## Review Focus

- App killed mid-rest → reopening goes straight to `/trening`, same exercise, rest bar shows the correct remaining time (or none if it ended). Test: Task 2 `resume` unit test + Task 5 e2e reload test.
- Weight typed with comma (`37,5`), empty, or garbage → stored as 37.5 / previous value kept; never NaN in DB. Test: Task 1 `parseWeight`.
- Exercise with no history → prefill weight 0, reps = repsMin, no hint, no crash. Test: Task 1 `buildPrefill` empty case.
- Finish with zero completed sets → offered to discard, not saved as an empty workout. Test: Task 2 `finishWorkout` zero-sets case.
- Swap on an exercise with completed sets → refused (button shows reason), completed sets untouched. Test: Task 2 `swapExercise` refuses.

---

### Task 1: Pure logic `src/data/progression.ts`

**Files:** Create `src/data/progression.ts`, `src/data/progression.test.ts`

**Interfaces (Produces):**
- `type SetValue = { weight: number; reps: number }`
- `epley1RM(weight: number, reps: number): number` (rounded to 0.1)
- `type Suggestion = { kind: 'increase'; weight: number; fromWeight: number } | { kind: 'reps'; weight: number; reps: number } | { kind: 'none' }`
- `suggestProgression(lastWorking: SetValue[], repsMin: number, repsMax: number, step: number): Suggestion` — empty → none; reference weight = max weight among `lastWorking`; all sets `reps >= repsMax` → increase to `ref + step`; else `reps` with target = min reps at ref weight + 1, capped at repsMax (if any set < repsMin, target = repsMin).
- `progressionText(s: Suggestion): string` — increase → `Spróbuj 37,5 kg (ostatnio pełny zakres przy 35 kg)`; reps → `Ten sam ciężar 35 kg, spróbuj 9 powt.`; none → `''`.
- `buildPrefill(lastSets: (SetValue & { warmup: boolean })[], warmupCount: number, workingCount: number, repsMin: number): (SetValue & { warmup: boolean })[]` — warm-ups first then working; working set i copies last working set i (or the last working one if fewer); warm-up i copies last warm-up i (or the last one if fewer); a set with nothing to copy → `{ weight: 0, reps: repsMin }`.
- `parseWeight(text: string): number | null` — accepts `37,5`, `37.5`, trims; negative/NaN/empty → null; rounds to 0.01.
- `formatKg(n: number): string` — `37,5`, `40`.
- `restRemainingSec(restEndsAt: number | undefined, now: number): number` — `max(0, ceil((end − now)/1000))`, undefined → 0.
- `formatClock(sec: number): string` — `m:ss` below an hour, `h:mm:ss` above.
- `workingVolume(sets: (SetValue & { warmup: boolean })[]): number` — Σ weight×reps of non-warm-ups.

- [ ] Step 1: tests `epley1RM(100,10)=133.3`, `(100,1)=100`, `(100,0)=0`; progression: `[35×12,35×12,35×12]` 8–12 step 2.5 → increase 37.5; `[35×12,35×10,35×9]` → reps 10 @35 ; `[35×7,35×12]` → reps 8 @35 (never increase); `[]` → none; prefill with 2 last working, 3 planned → third copies second; empty history case; `parseWeight('37,5')=37.5`, `('abc')=null`, `('')=null`, `('-5')=null`; `restRemainingSec(10_000, 2_500)=8`, past → 0; `formatClock(65)='1:05'`, `(3725)='1:02:05'`; volume excludes warm-ups.
- [ ] Step 2: `npx vitest run src/data/progression.test.ts` → FAIL. Step 3: implement. Step 4: PASS. Step 5: commit `feat: workout maths - progression, Epley 1RM, prefill, timers`.

### Task 2: Data layer `src/data/workouts.ts`

**Files:** Modify `src/data/types.ts`; create `src/data/workouts.ts`, `src/data/workouts.test.ts`

**Types (no Dexie schema change, fields are unindexed):**
```ts
export interface WorkoutExercise { exerciseId: Id; warmupSets: number; sets: number; repsMin: number; repsMax: number; restSec: number }
// Workout gains (all optional, import workouts lack them):
exercises?: WorkoutExercise[]; currentIndex?: number; restEndsAt?: number; restTotalSec?: number;
```
Exercise ids are unique within a workout (picker disables ones already in it). `WorkoutSet.exerciseOrder` = index in `exercises`, renumbered on remove.

**Interfaces (Produces):**
- `getActiveWorkout(): Promise<Workout | undefined>`
- `startWorkout(opts: { planId?: string; dayId?: string }): Promise<Workout>` — returns the active one if any; name = day name or `Trening`; creates prefilled sets (Task 1 `buildPrefill` from `getLastSets`).
- `getLastSets(exerciseId, excludeWorkoutId?): Promise<WorkoutSet[]>` — completed sets of the newest finished workout containing the exercise.
- `addExercises(workoutId, exerciseIds)` (settings defaults), `swapExercise(workoutId, index, newExerciseId)` (throws `Ćwiczenie ma zaliczone serie` if any completed), `removeExercise(workoutId, index)` (deletes its sets; UI confirms if completed ones exist).
- `updateSet(setId, patch: Partial<Pick<WorkoutSet,'weight'|'reps'|'warmup'>>)`, `addSet(workoutId, index)` (copies the last set's values), `removeSet(setId)`.
- `completeSet(setId, now)` — sets `completedAt`, and on the workout `restEndsAt = now + restSec*1000`, `restTotalSec`. `uncompleteSet(setId)`.
- `setCurrentIndex(workoutId, i)`, `skipRest(workoutId)`, `extendRest(workoutId, sec, now)`.
- `finishWorkout(workoutId, now): Promise<'finished' | 'empty'>` — deletes uncompleted sets, sets `endedAt`, clears rest; `'empty'` (nothing written) when no completed sets. `discardWorkout(workoutId)` deletes workout + sets.
- `getExerciseHistory(exerciseId, excludeWorkoutId?): Promise<{ workout: Workout; sets: WorkoutSet[] }[]>` newest first, finished only, completed sets.
- `summarizeWorkout(workoutId): Promise<{ durationSec; sets; volume; records: { exerciseId; kind: 'weight' | 'e1rm' | 'volume'; value: number }[] }>` — records only when the exercise has earlier finished history and the value beats every earlier one; warm-ups excluded.

- [ ] Step 1: tests (fake-indexeddb, `db.delete()+open()` in beforeEach): start from plan day → sets count = warmups+sets, prefill from previous finished workout; second `startWorkout` returns the same one; `completeSet` sets restEndsAt = now+restSec*1000; resume: `getActiveWorkout` after setting currentIndex/rest returns them; swap refuses with completed sets; remove renumbers exerciseOrder; finish deletes uncompleted sets and returns `'empty'` for none; summary volume/records exclude warm-ups and only beat earlier history; `getLastPlanDayId` sees the finished workout.
- [ ] Step 2–4: FAIL → implement → PASS. Step 5: commit `feat: live workout data layer`.

### Task 3: Workout screen `/trening`

**Files:** Create `src/pages/WorkoutPage.tsx` + `.css`, `src/components/workout/SetEditor.tsx`, `RestBar.tsx`, `ExerciseInfoSheet.tsx` (tabs Historia / Notatki / Statystyki with inline SVG chart of max weight and e1RM per workout), `src/hooks/useWakeLock.ts`, `src/hooks/useNow.ts`, `src/audio/beep.ts`. Modify `App.tsx` (routes, hide nav, resume redirect on launch), `BottomNav.tsx`, `StartPage.tsx`.

- Header (sticky, safe-area top): back to Start (workout keeps running), day name, total timer `formatClock`, menu button (Dodaj / Zamień / Usuń ćwiczenie, Anuluj trening), "Zakończ" button.
- Dots under the header = exercises; body = horizontal `scroll-snap` pager, one panel per exercise; scroll end saves `currentIndex`; on mount scrolls to saved index.
- Panel: name (link-free), target `3 × 8–12`, progression hint with "Użyj" (sets suggested weight on uncompleted working sets), set list (number or `R` for warm-up, `kg × powt.`, green when done), selected-set editor: weight −/+ (step) and input (`inputMode="decimal"`), reps −/+ and input, "Rozgrzewka" toggle, big "Zalicz serię"; for a done set "Cofnij zaliczenie"; "+ Seria", "Usuń serię"; buttons Historia / Notatki / Statystyki open `ExerciseInfoSheet`.
- RestBar fixed at bottom above safe area: remaining `m:ss`, progress, "+15 s", "Pomiń"; at 0: beep (WebAudio oscillator pre-scheduled at completion time, context unlocked by the tap) + `navigator.vibrate?.([200,100,200])`, bar disappears.
- Wake lock: `navigator.wakeLock?.request('screen')` while on `/trening`, re-requested on `visibilitychange`.
- Start page: active workout card "Trwa trening · Wróć do treningu"; otherwise "Rozpocznij trening" (plan day) + "Pusty trening".
- App launch: if an active workout exists, navigate to `/trening` once.

### Task 4: Finish screen `/trening/podsumowanie/:id`

**Files:** Create `src/pages/WorkoutSummaryPage.tsx` + `.css`. "Zakończ" asks to confirm; `'empty'` result → sheet "Brak zaliczonych serii — usunąć trening?". Summary tiles: Czas, Serie, Objętość (kg), list of new records (`Nowy rekord: Bench Press — 1RM 110 kg`), button "Gotowe" → Start.

### Task 5: Playwright `e2e/workout.spec.ts` (project `mobile`)

- plan day → start → prefilled sets visible → change weight with + and typing `37,5` → Zalicz serię → rest bar appears → Pomiń.
- reload mid-workout → lands on `/trening`, same exercise index, completed set still green.
- empty workout → add exercise via picker → complete set → Zakończ → summary shows 1 seria and volume.
- second workout of same exercise → prefilled from first, record shown on summary after heavier set.
- [ ] Run `npx playwright test --project=mobile` → all pass; `npx vitest run` → all pass; `npm run build` OK.
- [ ] Manual check at 375×812 in the built-in browser (preview `gym-app`), then commit + push, confirm Pages deploy.
