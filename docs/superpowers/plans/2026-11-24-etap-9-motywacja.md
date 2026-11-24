# Etap 9: Motywacja i statystyki — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Weekly goal + week streak on Start, sets per muscle vs a 10–20 band, a Rekordy screen with badges (and a badge celebration in the finish summary), and a yearly activity calendar — all computed from existing history.

**Architecture:** Pure functions in two new data modules (`src/data/motivation.ts` — weeks, streak, muscle week, calendar levels; `src/data/badges.ts` — record replay and badges), unit-tested with plain arrays (no DB). Pages load the existing `loadStatsInput()` and call them. The only new stored value is `AppSettings.weeklyGoal` (no schema change; backup picks it up through `DEFAULT_SETTINGS`).

**Tech Stack:** React 19, TypeScript, Dexie 4 (`useLiveQuery`), Vite, Vitest, Playwright (iPhone 13 profile, chromium), lucide icons.

**Spec:** `docs/superpowers/specs/2026-11-22-gym-app-design.md` + the stage brief (copied into Global Constraints).

## Global Constraints

- Polish UI copy; dark tokens from `src/theme/tokens.css`; `env(safe-area-inset-*)` respected by existing layout; no new dependencies.
- Weeks start Monday 00:00 local time. Only finished workouts count (`isFinished`). Working set = `workingSets()` from `records.ts` (no warm-ups, completed, reps > 0).
- Weekly goal: setting „Cel: treningi w tygodniu”, 1–7, default 3. A week counts when finished workouts ≥ goal. The current week never breaks the streak; it adds 1 once met. Past weeks are judged with the current goal (no goal history stored).
- Muscle band: < 10 „za mało”, 10–20 „✓”, > 20 „dużo”. Primary group = 1 set, secondary group = 0.5 (a group that is both primary and secondary for an exercise counts 1). Note shown under the list.
- Badges: first workout; 10/50/100/250 workouts; 4-week and 12-week streak; first set ≥ 100 kg; 1000 working sets; 10/50/100 records. Records counted exactly like the finish summary (weight, e1RM, volume, reps-at-weight; an exercise's first workout never counts).
- Motion: ≤ 250 ms, transform/opacity, reduced motion handled by the global block in `motion.css`. Swipe: horizontal ≥ 50 px and |dx| > |dy| (same as Historia calendar).

## Review Focus

- Workout on Sunday 23:30 vs Monday 00:10 lands in the right week (local time) → unit test `weekStartOf` on both sides of midnight.
- Streak with a gap week in the middle and an unmet current week → streak counts only the run ending last week (unit test).
- Lowering the goal later makes old weeks count → expected; pinned by the unit test with goal 1 vs 3 on the same data.
- Imported workouts (no duration, all sets working) count for streaks, calendar and badges like app workouts (unit tests use `source: 'import'` rows).
- Day with two workouts in the calendar → tapping opens Historia on that day, not one arbitrary workout (e2e).

---

### Task 1: Weeks, streak, muscle week, calendar levels (data)

**Files:** Create `src/data/motivation.ts`, `src/data/motivation.test.ts`; Modify `src/data/types.ts` (`weeklyGoal: number` on `AppSettings`), `src/data/settings.ts` (`weeklyGoal: 3` in defaults).

**Produces:**
- `weekStartOf(t: number, weeks = 0): number` — local Monday 00:00 (moved here from `stats.ts`'s private `mondayOf`, which then imports it).
- `clampGoal(n: unknown): number` — integer 1–7, else 3.
- `weekProgress(workouts: Workout[], goal: number, now: number): { done: number; goal: number; met: boolean; streak: number }`.
- `type MuscleStatus = 'low' | 'ok' | 'high'`; `muscleWeek(input: StatsInput, weekStart: number): { group: MuscleGroup; label: string; sets: number; status: MuscleStatus }[]` — all 10 groups in `MUSCLE_GROUPS` order; `unmapped: number` returned alongside as `{ rows, unmapped }`.
- `dayKey(t: number): string` (`YYYY-MM-DD` local); `yearActivity(input: StatsInput, year: number): Map<string, { sets: number; workoutIds: string[] }>`; `activityLevel(sets: number): 1 | 2 | 3 | 4` — `<12 → 1, <20 → 2, <28 → 3, else 4`.

- [ ] Tests: `weekStartOf: Sunday 23:30 belongs to the previous Monday, Monday 00:10 to the new one`; `weekProgress counts only finished workouts this week`; `streak: 3 met weeks + unmet current week = 3`; `streak: met current week adds 1`; `streak: gap week resets`; `streak with goal 1 vs 3 on the same data`; `muscleWeek: primary 1, secondary 0.5, warm-ups ignored, status bands 9.5→low, 10→ok, 20→ok, 20.5→high`; `yearActivity groups two workouts on one day`; `activityLevel thresholds`.
- [ ] `npx vitest run src/data/motivation.test.ts` fails, implement, passes; `npx vitest run src/data/stats.test.ts` still passes.

### Task 2: Records replay and badges (data)

**Files:** Create `src/data/badges.ts`, `src/data/badges.test.ts`; Modify `src/data/workouts.ts` (`summarizeWorkout` uses the shared pure `findNewRecords`).

**Produces:**
- `findNewRecords(nowWorking: WorkoutSet[], earlierWorking: WorkoutSet[]): NewRecord[]` for one exercise (moved logic out of `summarizeWorkout`; behaviour unchanged — existing `workouts.test.ts` must stay green).
- `interface Badge { id: string; title: string; description: string; earnedAt?: number; workoutId?: string; progress?: { current: number; target: number } }`.
- `computeBadges(input: StatsInput, goal: number): Badge[]` — fixed order (list in Global Constraints); earned date = start of the workout that crossed the threshold.
- `exerciseBests(input: StatsInput): { exerciseId: string; records: ExerciseRecords; lastAt: number }[]` — newest `lastAt` first, via `computeRecords`.

- [ ] Tests: `first workout badge dated by the first finished workout`; `10 workouts badge on the 10th, progress 9/10 before`; `100 kg badge ignores warm-ups`; `1000 sets badge`; `4-week streak badge dated by the workout that met the 4th week`; `records count matches summary rules (first time never counts)`; `exerciseBests sorted by last trained`.
- [ ] `npx vitest run src/data/badges.test.ts src/data/workouts.test.ts` passes.

### Task 3: Start card + setting

**Files:** Create `src/components/WeekGoalCard.tsx` + `.css`; Modify `src/pages/StartPage.tsx` (card after the main card, in the plan and no-plan states, not during a live workout), `src/pages/SettingsPage.tsx` (section „Motywacja”, `SettingRow` „Cel: treningi w tygodniu” select 1–7).

- Card: SVG ring (done/goal, accent stroke, full ring = success colour), text „2/4 w tym tygodniu”, „Seria: 7 tygodni z rzędu” (plural via `plural()`; 0 → „Seria: zacznij w tym tygodniu”), hint „Jeszcze 2 do celu” / „Cel tygodnia zaliczony ✓”. `aria-label="Cel tygodnia"`. Link „Zmień cel” → `/ustawienia`.

### Task 4: Statystyki — Tydzień tab, Rekordy link, year calendar

**Files:** Create `src/pages/MuscleWeek.tsx`, `src/components/stats/YearCalendar.tsx` + `.css`; Modify `src/pages/StatsPage.tsx` (+ `.css`), `src/pages/HistoryPage.tsx` (export `openHistoryDay(year, month, day)` setting its remembered view).

- Top tabs: „Treningi | Tydzień | Ciało”. Tydzień: segmented „Ten tydzień | Poprzedni”, rows with label, value (`formatKg` style, comma), bar on a 0–25 scale with the 10–20 band shaded, status chip; note „Rozgrzewki się nie liczą. Mięsień główny = 1 seria, pomocniczy = ½.”
- Header: links „Rekordy” (`/statystyki/rekordy`) and „Raport dla trenera”.
- Treningi tab, last card „Aktywność”: `YearCalendar` — 12 mini months (3 per row), Monday-first, cells coloured by `activityLevel` (accent at 25/50/75/100 % mix), legend „Mniej … Więcej”, arrows + swipe between years (first workout year … current year), count „N dni treningowych”. Tap a day: one workout → `/historia/:id`, more → `openHistoryDay` + `/historia`.

### Task 5: Rekordy screen + summary celebration

**Files:** Create `src/pages/RecordsPage.tsx` + `.css`; Modify `src/App.tsx` (route `/statystyki/rekordy`), `src/pages/WorkoutSummaryPage.tsx` (+ `.css`).

- RecordsPage: back button, tabs „Odznaki | Rekordy”. Odznaki: grid; earned = accent icon + „zdobyta 12 mar 2026”; locked = muted, lock icon, progress „7/10”. Rekordy: list per exercise (name, „Najcięższa: 100 kg × 5 · data”, „1RM: 116,7 kg · data”), row links to `/cwiczenia/:id`.
- Summary: badges with `workoutId === id` → section „Nowa odznaka!” with a pop-in animation (scale .9→1 + opacity, 250 ms) above „Nowe rekordy”.

### Task 6: Tests, phone check, ship

- [ ] e2e `e2e/motivation.spec.ts` (add to `playwright.config.ts` mobile list): import the sample CSV → Start shows the goal card; change the goal in Ustawienia → card text follows; Statystyki → Tydzień tab shows the note; Rekordy → „Pierwszy trening” earned and „Rekordy” list shows exercises; calendar year with the sample shows days and tapping one opens the workout; finish a live workout → „Nowa odznaka!”.
- [ ] `npx vitest run`, `npx tsc -b`, `npm run lint`, full Playwright run (own ports), phone-size screenshots, design doc note, commit, rebase on `origin/main`, rerun, push `HEAD:main`, check the Pages deploy.
