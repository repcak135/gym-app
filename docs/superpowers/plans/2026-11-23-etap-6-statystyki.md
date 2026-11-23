# Etap 6 (Statystyki) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Statystyki tab: period switch (Tydzień / Miesiąc / Rok / Wszystko) with arrows, tiles (workouts, total time, average time, working sets), donut "Serie na mięsień" (main / secondary muscles), front + back body silhouette coloured by sets or by days since last trained, workouts-per-week bar chart.

**Architecture:** One muscle vocabulary map (`src/data/muscleMap.ts`) turns every muscle word of all exercise sources into a chart group and silhouette parts; a unit test proves nothing in the data is unmapped. Pure stats functions in `src/data/stats.ts` (period ranges, tiles, sets per group / body part, days since trained, weekly counts) plus one Dexie loader. Charts are hand-made SVG (no chart library: two simple charts don't justify ~100 kB of Recharts). The silhouette is our own component drawing the MIT-licensed polygons copied from `react-body-highlighter` 2.0.5 (the package itself colours only by exercise count and can't take per-muscle values or a dark theme, so we copy the SVG data, as the spec allows).

**Tech Stack:** React 19, react-router 8 (HashRouter), Dexie 4 + dexie-react-hooks, lucide-react, Vitest + fake-indexeddb, Playwright (project `mobile`, iPhone 13).

**Spec:** `docs/superpowers/specs/2026-11-22-gym-app-design.md` (sections "6. Statystyki", "8. Import historii" — imported workouts have no duration, "Decyzje techniczne", "Pozostawione budującemu").

## Global Constraints

- Polish UI; numbers with Polish formatting; dark tokens from `src/theme/tokens.css`; touch targets ≥ 44 px; respect `env(safe-area-inset-*)`.
- Only finished workouts (`isFinished` from `workouts.ts`); working sets only = `workingSets()` from `records.ts` (`!warmup && completedAt !== undefined && reps > 0`). "Rozgrzewki nie liczą się do statystyk."
- Imported workouts (`source: 'import'`) have no duration: excluded from total and average time; the time tile says so subtly ("bez N z importu").
- Chart groups (verbatim, this order): klatka, plecy, barki, nogi, biceps, triceps, brzuch, łydki, pośladki, przedramiona.
- Muscle words (all sources use free-exercise-db's vocabulary): abdominals, abductors, adductors, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower back, middle back, neck, quadriceps, shoulders, traps, triceps.
- Week starts on Monday; periods are calendar periods in local time.
- `react-body-highlighter` © 2020 GV79, MIT: polygons copied with the MIT notice in the file header and credited in `NOTICE.md`. Not added as a dependency.
- Owner's real `gym-day.csv` never committed; tests use `tests/fixtures/sample-export.csv`.

## Review Focus

- No workouts at all / empty period → tiles show 0 and "—", donut and silhouette show an empty state, no NaN, no division by zero. Test: Task 2 `empty period`.
- Custom exercises without muscles (import creates them, e.g. "Wiosło Krzywe") → their sets count in "Serie" but not in the donut; donut shows "N serii bez przypisanych mięśni". Test: Task 2 + Task 4 e2e.
- An exercise with two primary muscles in the same group (e.g. lats + middle back) → one set counts once for "plecy", not twice. Test: Task 2.
- Week period across a year boundary / DST change → correct Monday–Sunday range, arrows step exactly one period. Test: Task 2 `periodRange`.
- A workout still in progress (no `endedAt`, source app) → not counted anywhere. Test: Task 2.

---

### Task 1: Muscle vocabulary map

**Files:**
- Create: `src/data/muscleMap.ts`, `src/data/muscleMap.test.ts`

**Interfaces:**
- Produces:
  - `type MuscleGroup = 'klatka' | 'plecy' | 'barki' | 'nogi' | 'biceps' | 'triceps' | 'brzuch' | 'lydki' | 'posladki' | 'przedramiona'`
  - `const MUSCLE_GROUPS: readonly { key: MuscleGroup; label: string; color: string }[]` (labels with Polish letters: "Klatka", "Plecy", "Barki", "Nogi", "Biceps", "Triceps", "Brzuch", "Łydki", "Pośladki", "Przedramiona")
  - `type BodyPart` = silhouette ids of react-body-highlighter without head/knees: `'chest' | 'abs' | 'obliques' | 'biceps' | 'triceps' | 'forearm' | 'front-deltoids' | 'back-deltoids' | 'trapezius' | 'upper-back' | 'lower-back' | 'quadriceps' | 'hamstring' | 'adductor' | 'abductors' | 'calves' | 'gluteal' | 'neck'`
  - `const BODY_PART_LABEL: Record<BodyPart, string>` (Polish)
  - `const MUSCLE_TO_GROUP: Record<string, MuscleGroup>` and `const MUSCLE_TO_BODY: Record<string, BodyPart[]>`
  - `function muscleGroup(m: string): MuscleGroup | undefined`, `function bodyParts(m: string): BodyPart[]`

Mapping (decided): chest→klatka/[chest]; lats→plecy/[upper-back]; middle back→plecy/[upper-back]; lower back→plecy/[lower-back]; traps→plecy/[trapezius]; neck→plecy/[neck]; shoulders→barki/[front-deltoids, back-deltoids]; quadriceps→nogi/[quadriceps]; hamstrings→nogi/[hamstring]; adductors→nogi/[adductor]; abductors→nogi/[abductors]; biceps→biceps/[biceps]; triceps→triceps/[triceps]; abdominals→brzuch/[abs, obliques]; calves→lydki/[calves]; glutes→posladki/[gluteal]; forearms→przedramiona/[forearm].

- [ ] **Step 1: Failing test** `muscleMap.test.ts`: collect every word in `primaryMuscles`/`secondaryMuscles` of `exercise-db.json`, `exercises-extra.json`, `exercises-og.json` `.added`, plus `MUSCLES` from `exerciseLabels.ts`; assert `muscleGroup(w)` defined and `bodyParts(w).length > 0` for each (failure message lists the unmapped words). Assert every `MuscleGroup` is reached by some word, and `MUSCLE_GROUPS` has 10 entries in the constraint order.
- [ ] **Step 2:** `npx vitest run src/data/muscleMap.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `muscleMap.ts`. Colours: 10 distinguishable hues readable on `--surface` (#171a21).
- [ ] **Step 4:** Test passes.

### Task 2: Stats logic

**Files:**
- Create: `src/data/stats.ts`, `src/data/stats.test.ts`

**Interfaces:**
- Consumes: Task 1 `muscleGroup`, `bodyParts`, `MuscleGroup`, `BodyPart`; `isFinished` (`workouts.ts`); `workingSets` (`records.ts`); `workoutDurationSec` (`history.ts`).
- Produces:
  - `type Period = 'week' | 'month' | 'year' | 'all'`
  - `interface PeriodRange { start: number; end: number; label: string }` (`end` exclusive)
  - `periodRange(period: Period, offset: number, now: number, firstAt?: number): PeriodRange` — offset 0 = current, -1 = previous. Labels: week `"17–23 lis 2026"` (cross-month `"29 gru – 4 sty 2027"`), month `"listopad 2026"`, year `"2026"`, all `"Wszystko"` (start = `firstAt` or `now`, end = now + 1 day).
  - `interface StatsInput { workouts: Workout[]; sets: WorkoutSet[]; muscles: Map<string, { primary: string[]; secondary: string[] }> }`
  - `interface PeriodStats { workouts: number; timedWorkouts: number; untimedWorkouts: number; totalSec: number; avgSec?: number; workingSets: number; byGroup: { primary: Record<MuscleGroup, number>; secondary: Record<MuscleGroup, number> }; unmappedSets: number; byBody: Partial<Record<BodyPart, number>> }`
  - `computeStats(input: StatsInput, range: PeriodRange): PeriodStats` — workouts whose `startedAt` is in `[start, end)`. Group counts: each working set adds 1 to each *distinct* group of the exercise's primary (resp. secondary) muscles. `unmappedSets` = working sets whose exercise has no primary muscles. `byBody`: primary muscle parts +1 per set, secondary parts +0.5 (each part at most once per set, primary wins).
  - `daysSinceTrained(input: StatsInput, now: number): Partial<Record<BodyPart, number>>` — whole days since the last working set (primary muscles only) per body part; parts never trained are absent.
  - `weeklyCounts(input: StatsInput, range: PeriodRange, period: Period): { weekStart: number; count: number }[]` — Monday weeks; for `week` the 12 weeks ending with the range's week; otherwise every week overlapping the range.
  - `loadStatsInput(): Promise<StatsInput>` — reads `db.workouts`, `db.sets`, `db.exercises` (muscles of all exercises incl. custom).

- [ ] **Step 1: Failing tests** (pure, hand-built inputs; Nov 2026 dates):
  - `periodRange`: week of Wed 2026-11-18 → start Mon 2026-11-16 00:00, end Mon 2026-11-23, label `"16–22 lis 2026"`; offset -1 → `"9–15 lis 2026"`; week containing 2026-12-31 → `"28 gru – 3 sty 2027"`; month offset -11 from Nov 2026 → `"grudzień 2025"`; year → `"2026"`; across DST (week of 2026-10-25) end − start = 7 calendar days by date, not 168 h.
  - `computeStats`: app workout 60 min + app workout 30 min + import workout → workouts 3, timedWorkouts 2, untimedWorkouts 1, totalSec 5400, avgSec 2700; warm-ups and reps 0 excluded from workingSets; unfinished app workout (no endedAt) ignored; exercise with primary [lats, middle back] → plecy +1 per set; secondary [biceps] counted only in `secondary`; custom exercise with no muscles → `unmappedSets`; byBody `upper-back` = sets, `biceps` = 0.5 × sets.
  - `empty period`: no workouts → all zeros, `avgSec` undefined, `byBody` empty.
  - `daysSinceTrained`: last chest set 3 days ago → `chest: 3`; never-trained parts absent.
  - `weeklyCounts`: month Nov 2026 → 6 weeks (Mon 26 Oct … Mon 30 Nov), counts in the right week.
- [ ] **Step 2:** `npx vitest run src/data/stats.test.ts` → FAIL.
- [ ] **Step 3:** Implement. Date math with `new Date(y, m, d)` (local), never adding fixed ms per day. Polish month names: genitive short (`sty lut mar kwi maj cze lip sie wrz paź lis gru`) for week labels, nominative full (`styczeń … grudzień`) for months.
- [ ] **Step 4:** Tests pass.

### Task 3: Body silhouette component

**Files:**
- Create: `src/components/stats/bodyPolygons.ts`, `src/components/stats/BodyMap.tsx`, `src/components/stats/BodyMap.css`
- Modify: `NOTICE.md` (new section "Body silhouette")

**Interfaces:**
- Consumes: Task 1 `BodyPart`, `BODY_PART_LABEL`.
- Produces: `<BodyMap values={Partial<Record<BodyPart, number>>} mode={'sets' | 'days'} />`.

- [ ] **Step 1:** Copy `anteriorData` / `posteriorData` from react-body-highlighter 2.0.5 `src/assets/index.ts` into `bodyPolygons.ts` as `ANTERIOR`/`POSTERIOR: { part: BodyPart | 'head' | 'knees' | 'left-soleus' | 'right-soleus'; points: string[] }[]`, MIT notice (© 2020 GV79) in the header. Soleus polygons are drawn as `calves`.
- [ ] **Step 2:** `BodyMap`: two SVGs side by side (viewBox `0 0 100 200`, captions "Przód" / "Tył"), base fill `--surface-2`, head/knees always base. `sets` mode: 0 → base; else 4 steps of `--accent` opacity by value relative to the max (legend "mniej → więcej"). `days` mode: ≤3 d green (`--success`), ≤7 d yellow, ≤14 d orange, >14 d or never red-ish (`--danger`); legend with these four buckets. Tapping a part (button-like `<g role="button" aria-label="…">`) shows "Klatka: 12 serii" / "Klatka: 3 dni temu" / "nigdy" below the figures. Each polygon has `aria-label` = part label; whole map `role="img"`-free group with `aria-label="Sylwetka"`.
- [ ] **Step 3:** `NOTICE.md`: credit react-body-highlighter (https://github.com/GV79/react-body-highlighter, MIT, © 2020 GV79), polygons copied in `src/components/stats/bodyPolygons.ts`.
- [ ] **Step 4:** `npx tsc -b` clean.

### Task 4: Statystyki screen

**Files:**
- Create: `src/components/stats/DonutChart.tsx`, `src/components/stats/WeekBars.tsx`, `src/pages/StatsPage.css`, `e2e/stats.spec.ts`
- Modify: `src/pages/StatsPage.tsx`, `playwright.config.ts` (add `stats.spec.ts` to `mobile`)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: route `/statystyki` content.

Layout (top → bottom): title; segmented control `role="tablist"` Tydzień / Miesiąc / Rok / Wszystko (default Miesiąc); period row: `‹` button "Poprzedni okres", label (`h2`), `›` "Następny okres" (disabled at offset 0; hidden for Wszystko); 2×2 tiles (`role="group"` with `aria-label`): "Treningi", "Łączny czas" (`12 h 30 min`, subtitle "bez 4 z importu" when untimed > 0), "Średni czas" (`52 min` or "—"), "Serie robocze"; section "Serie na mięsień": toggle Główne / Pomocnicze, donut (total in centre), legend list (colour dot, group label, count, sorted by count, zero groups hidden), note "N serii bez przypisanych mięśni" when > 0; section "Sylwetka": toggle Serie / Dawno nietrenowane, `BodyMap`; section "Treningi w tygodniu": `WeekBars` (bar per week, y = count, small month labels, average line text "średnio X / tydz."). Empty period: one muted line "Brak treningów w tym okresie" instead of charts. Swipe left/right on the period row optional (not required).

- [ ] **Step 1: e2e test** `stats.spec.ts`: import `tests/fixtures/sample-export.csv` (same flow as `import.spec.ts`, keep "Wiosło Krzywe" as custom), open Statystyki, choose "Wszystko": tile "Treningi" 3, "Serie robocze" equals the number of imported sets with reps > 0, "Łączny czas" shows "bez 3 z importu"; donut legend contains "Plecy" and "Klatka"; note "bez przypisanych mięśni" visible; toggle "Dawno nietrenowane" shows the legend bucket "ponad 14 dni"; switch to "Miesiąc" then press "Poprzedni okres" until `marzec 2026` → Treningi 3.
- [ ] **Step 2:** Implement charts + page (hand-made SVG; strokes on dark tokens).
- [ ] **Step 3:** `npx vitest run`, `npx tsc -b`, `npx playwright test --project=mobile` all pass.
- [ ] **Step 4:** Check at phone size in the built-in browser with the owner's real CSV imported (not committed): all four periods, both toggles, arrows, safe areas.
- [ ] **Step 5:** Commit + push to `main`, confirm the GitHub Actions deploy, check https://repcak135.github.io/gym-app/#/statystyki.
