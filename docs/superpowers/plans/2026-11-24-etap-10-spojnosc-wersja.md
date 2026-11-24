# Etap 10 — spójność, filtry w pickerze, wersja i „Co nowego” — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared exercise search/filter toolbar for the Ćwiczenia tab and the exercise picker, a consistency pass that removes twin-feature drift, and app version 0.9.0 with a Polish "Co nowego" sheet.

**Architecture:** `ExerciseFinder` (controlled component: scope + search + Mięśnie/Sprzęt + filter sheets) and `useExerciseFinder` (pool → filtered + recent) are used by `ExercisesPage` (state in URL) and `ExercisePicker` (local state). Twin features get shared components (`ExerciseRow`, `ExerciseHowTo`, `NoteEditor`, `ShareLinkPanel`, plural helpers in `src/data/plural.ts`). Version comes from `package.json` via Vite `define` (`__APP_VERSION__`); `src/data/changelog.ts` holds entries; `WhatsNew` decides at launch.

**Tech Stack:** React 19 + TS, Dexie, Vite 8, Vitest, Playwright (iPhone 13 chromium).

**Spec:** `docs/superpowers/specs/2026-11-22-gym-app-design.md` + the task brief (picker filters, audit, version 0.9.0).

## Global Constraints

- Polish UI copy; dark tokens from `src/theme/tokens.css`; motion as in `Sheet.css` (`sheet-slide-up`, 0.22s).
- iPhone: fixed overlays respect `env(safe-area-inset-*)`; sheets with text fields use `sheet-backdrop--top` or `--kb-inset`.
- Version `0.9.0`, defined only in `package.json`.
- `lastSeenVersion` is device-only: excluded from backup export, kept on restore and on wipe (same as `exerciseDbVersion`).
- Brand-new user (no workouts, plans, body entries, custom exercises) sees no sheet; version is just stored.
- Commit only own files by name; push to `main`.

## Review Focus

- Picker opened with filters, then closed and reopened: filters reset (no stale state) — covered by picker unit/e2e flow.
- Search + filter giving 0 results shows "Brak wyników" + "Wyczyść filtry" in both places — e2e.
- Existing user (has data, no `lastSeenVersion`) sees the sheet once; reload does not show it again — e2e.
- Backup restore must not overwrite `lastSeenVersion` — unit test in `backup.test.ts`.
- `compareVersions('0.10.0','0.9.0') > 0` (not string compare) — unit test.

---

### Task 1: Shared exercise finder

**Files:** Create `src/components/ExerciseFinder.tsx`, `src/components/ExerciseRow.tsx`; modify `src/pages/ExercisesPage.tsx`, `src/components/ExercisePicker.tsx`, `src/components/ExercisePicker.css`; test `e2e/exercises.spec.ts`.

**Interfaces (Produces):**
- `interface FinderState { query: string; muscle: string | null; equipment: string | null; scope: Scope }`, `EMPTY_FINDER`.
- `useExerciseFinder(all: Exercise[] | undefined, s: FinderState): { filtered: Exercise[]; recent: Exercise[]; isFiltered: boolean }`.
- `<ExerciseFinder state onChange={(patch: Partial<FinderState>) => void} />` renders scope Segmented, search with clear (×), Mięśnie/Sprzęt FilterButtons and FilterSheets.
- `<FinderEmpty state onReset />` — empty-state text (scope text or "Brak ćwiczeń dla tych filtrów." + "Wyczyść filtry").
- `<ExerciseRowContent exercise size />` — thumb + name + Własne + Polish name + meta.

- [ ] Write e2e `picker ma filtry Mięśnie i Sprzęt`: plan day → Dodaj ćwiczenia → Mięśnie → Łydki → every `.exercise-row__meta` in dialog contains „Łydki”; Wyczyść filtr restores.
- [ ] Implement finder; Ćwiczenia keeps URL params `q/m/s/t`; picker shows „Ostatnio używane” when not filtered.
- [ ] Existing `exercises.spec.ts` + new test pass.

### Task 2: Consistency audit + fixes

**Files:** Create `docs/consistency-audit.md`, `src/components/ExerciseHowTo.tsx` (photos, tips, instructions; moved from `ExerciseDetailPage`), `src/components/NoteEditor.tsx`, `src/components/ShareLinkPanel.tsx`; modify `ExerciseInfoSheet.tsx`, `ExerciseDetailPage.tsx`, `PlanSharePage.tsx`, `ExerciseSharePage.tsx`, `WorkoutDetailPage.tsx`, `PasteLinkSheet.tsx`, plural users; extend `src/data/plural.ts` (`exercisesLabel`, `daysLabel`, `workingSetsLabel`).

- [ ] Info sheet gains „Opis” tab (ExerciseHowTo) and RecordsSection in Statystyki; card gains the weight/1RM chart (shared `ExerciseProgressChart`).
- [ ] Both notes use `NoteEditor` (debounced save + „Zapisano”).
- [ ] Workout detail sets show „Rozgrzewka” / RPE like `ExerciseHistoryList`.
- [ ] Plan/exercise share pages use `ShareLinkPanel`.
- [ ] `ExerciseDetailPage` uses shared `ConfirmSheet`; PasteLinkSheet opens at the top.
- [ ] All plural helpers come from `src/data/plural.ts`; unit test `plural.test.ts` (1, 2, 5, 12, 22, 112).
- [ ] Unit + e2e green.

### Task 3: Version 0.9.0 + Co nowego

**Files:** Modify `package.json` (0.9.0), `vite.config.ts` (`define: { __APP_VERSION__ }`), `vitest.config.ts` (same define), create `src/version.ts`, `src/data/changelog.ts`, `src/data/whatsNew.ts` (+ test), `src/components/WhatsNewSheet.tsx`; modify `src/data/types.ts` (`lastSeenVersion?: string`), `backup.ts`, `wipe.ts`, `App.tsx`, `SettingsPage.tsx`, design doc; test `e2e/whats-new.spec.ts`.

**Interfaces:**
- `APP_VERSION: string` from `src/version.ts`.
- `CHANGELOG: { version: string; date: string; items: string[] }[]` newest first.
- `compareVersions(a, b): number`; `decideWhatsNew(lastSeen: string | undefined, current: string, hasData: boolean): 'show' | 'store' | 'none'`; `entriesSince(lastSeen)`.
- `markVersionSeen(v)`.

- [ ] Unit tests: new user → `store`; existing user without lastSeen → `show`; same → `none`; older → `show`; backup excludes `lastSeenVersion`; wipe keeps it.
- [ ] Sheet shows once on launch, closing stores; Ustawienia „Wersja 0.9.0” + „Co nowego” reopens all entries.
- [ ] E2E: seed data via UI (a plan), clear lastSeen through IndexedDB, reload → sheet; close → reload → none; Ustawienia → Co nowego → sheet.
- [ ] Design doc rule: every user-visible release bumps version + changelog entry.

### Task 4: Verify, ship

- [ ] `npx vitest run`, `npx playwright test --project=mobile`, `npm run build`, phone-size check in the browser pane, commit by file name, push, `gh run watch`.
