# Etap 8: Dopracowanie i animacje — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swipe-to-delete with undo on six lists, light motion across the app, and short haptic pulses, without slowing the live workout.

**Architecture:** One `SwipeRow` component (pointer events, `touch-action: pan-y`, no library) wraps list rows; deletion commits at once and a global undo toast (`undo.ts` store + `UndoToast`) offers "Cofnij" for 5 s, restoring from a snapshot taken by `src/data/undoable.ts`. Motion is CSS only (tokens + keyframes in `src/theme/motion.css`), screens fade/slide via a keyed wrapper in `App.tsx`, and everything collapses to no motion under `prefers-reduced-motion`. Haptics go through one `haptic()` helper gated by Ustawienia > Wibracja.

**Tech Stack:** React 19, TypeScript, Dexie 4, Vite 8, Vitest + fake-indexeddb, Playwright (iPhone 13 profile, chromium).

**Spec:** `docs/superpowers/specs/2026-11-22-gym-app-design.md` ("Później" → "Dopracowanie i animacje") plus the stage brief (below as Global Constraints).

## Global Constraints

- Polish UI copy; dark tokens from `src/theme/tokens.css`; respect `env(safe-area-inset-*)`.
- Animations ≤ 250 ms, only `transform` / `opacity` (plus the one height collapse after a swipe delete); no new animation library.
- `prefers-reduced-motion: reduce` → no animations or transitions (JS waits become 0 ms).
- Swipe: left only; ignore gestures starting < 24 px from the left screen edge (iOS back swipe); vertical movement first → no swipe (page scrolls).
- Existing delete buttons and confirm sheets stay (accessible path). Deleting plans and workouts always offers undo.
- Haptics: `navigator.vibrate` short pulses only, off when `settings.restVibration` is false.
- Live workout must not regress: no per-frame JS, no layout-thrashing animations in `WorkoutPage`.

## Review Focus

- Vertical scroll over a swipe row on a phone must scroll the page, never open the row → e2e: a vertical drag leaves the row closed.
- A drag that ends on a link must not navigate → e2e: after a partial swipe the URL is unchanged.
- Undo after leaving the screen (toast lives in App) must still restore → toast rendered outside routes; unit tests restore without UI.
- Custom exercise used in a plan/history cannot be swiped away → row springs back, toast shows the reason, nothing deleted (unit test on `removeCustomExerciseUndoable`).
- Undo of a deleted day/item after another edit must not wipe that edit → restore inserts the snapshot back into the current plan, not a whole-plan overwrite (unit test).

---

### Task 1: Undoable deletes (data)

**Files:** Create `src/data/undoable.ts`, Test `src/data/undoable.test.ts`

**Interfaces — Produces** (each deletes now and returns a restore function):
- `removePlanUndoable(id: string): Promise<() => Promise<void>>` — restores the plan and, if it was active and nothing is active now, `activePlanId`.
- `removeDayUndoable(planId: string, dayId: string): Promise<() => Promise<void>>` — reinserts the day at its old index (clamped) into the current plan, unless the plan is gone or the day id is already present.
- `removeItemUndoable(planId: string, dayId: string, index: number): Promise<() => Promise<void>>` — same for an item.
- `removeWorkoutUndoable(id: string): Promise<() => Promise<void>>` — snapshot of workout + all its sets, restored in one transaction.
- `removeBodyEntryUndoable(id: string): Promise<() => Promise<void>>`.
- `removeCustomExerciseUndoable(id: string): Promise<{ ok: true; restore: () => Promise<void> } | { ok: false; reason: string }>` — uses `deleteCustomExercise` rules; snapshot exercise + note.

- [ ] Tests (fake-indexeddb, `beforeEach` delete/open like `body.test.ts`): `plan delete + restore keeps days and active flag`; `day restore goes back to its index and keeps a later rename of another day`; `item restore goes back to its index`; `workout restore brings back all sets`; `body entry restore`; `custom exercise used in a plan is refused and stays`; `custom exercise restore brings back its note`.
- [ ] `npx vitest run src/data/undoable.test.ts` fails, implement, passes.

### Task 2: Undo toast + haptics + motion base

**Files:** Create `src/undo.ts`, `src/components/UndoToast.tsx` + `.css`, `src/haptics.ts`, `src/theme/motion.css`; Modify `src/main.tsx` (import motion.css), `src/App.tsx`.

**Interfaces — Produces:**
- `showUndo(message: string, undo?: () => Promise<void>): void` and `useUndoToast()` in `src/undo.ts` (tiny external store; new toast replaces old; 5000 ms auto-hide; no `undo` → info toast without button).
- `<UndoToast />` rendered once in `App` above the bottom nav: `role="status"`, button **Cofnij**; after undo shows nothing.
- `haptic(kind: 'tick' | 'delete'): void` (`tick` = 12 ms, `delete` = [8, 40, 16]); `setHapticsEnabled(on: boolean)`; App syncs it from `settings.restVibration`.
- `motionMs(ms: number): number` (also in `src/haptics.ts`) → 0 under reduced motion.
- `motion.css`: tokens `--dur-fast: 120ms; --dur: 200ms; --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1)`; `.screen` enter keyframes (`screen-in-fwd` translateX 14px, `screen-in-back` −14px, `screen-in-fade` translateY 6px, all with opacity); `.list-in > *` item-in with `--i` stagger capped at 8 × 25 ms; global press feedback `button:not(:disabled):active, .plan-btn:active { scale: .97 }`; reduced-motion block zeroing animation/transition durations.
- `App.tsx`: `<div className="screen screen--{dir}" key={pathname}>` around `Routes`; dir from path depth vs previous (deeper `fwd`, shallower `back`, else `fade`); `/trening` uses opacity only (its fixed rest bar must not be inside a transformed box).

- [ ] Verified by Task 5 e2e (reduced motion → `.screen` animation-duration ≈ 0) and visually.

### Task 3: SwipeRow

**Files:** Create `src/components/SwipeRow.tsx`, `SwipeRow.css`.

**Interfaces — Produces:** `<SwipeRow label={name} onDelete={() => Promise<boolean | void> | void}>{row}</SwipeRow>`. `false` from `onDelete` = not deleted → row springs back.

Behaviour: pointerdown (primary, x ≥ 24) records start; lock horizontal when |dx| > 10 and |dx| > 1.2·|dy| with dx < 0, vertical lock cancels; drag translates content (rubber band past full width); release: past 55 % width → full delete, past 44 px → open at −88 px, else close. Behind the content a red action with `Trash2` + "Usuń", `aria-label="Usuń: {label}"`, `tabIndex`/`aria-hidden` only when open. Click after a drag is swallowed in capture phase. One row open at a time; pointerdown elsewhere closes. Delete: slide out (200 ms) → height collapse (180 ms) → `haptic('delete')` → `onDelete()`.

### Task 4: Wire the six lists + set tick + rest bar

**Files:** Modify `PlansPage.tsx`, `PlanDetailPage.tsx`, `PlanDayPage.tsx`, `HistoryPage.tsx`, `BodyStats.tsx` (metric "Pomiary" list), `ExercisesPage.tsx` (tab Moje, custom rows only), `components/workout/ExercisePanel.tsx`, `WorkoutPage.css`, `RestBar.tsx`.

- Toast copy: `Usunięto plan „{name}”`, `Usunięto dzień „{name}”`, `Usunięto ćwiczenie „{name}”`, `Usunięto trening`, `Usunięto pomiar`, `Usunięto ćwiczenie „{name}”`; refused exercise → reason, no button.
- Existing sheet deletes of plan/day/workout/body entry/exercise switch to the undoable functions and also show the toast.
- Set tick: `complete()` marks `justDoneId` for 450 ms → `.set-row--just-done` (green fill `::before` scaleX 0→1 200 ms, check `check-pop` 260 ms) + `haptic('tick')`.
- Rest bar: fill transition `transform 1s linear` (ticks are 1 s), enter `rest-in` slide-up 200 ms.

### Task 5: Tests and check

**Files:** Create `e2e/polish.spec.ts`; add to `playwright.config.ts` mobile `testMatch`.

- `swipe deletes a plan and Cofnij restores it`; `tap on revealed button deletes a day, Cofnij restores`; `swipe deletes an exercise from a day`; `swipe deletes a workout in Historia and Cofnij restores` (seed via app import or IndexedDB); `vertical drag does not open the row`; `partial swipe does not navigate`; `reduced motion: .screen has no animation`.
- Swipes via CDP `Input.dispatchTouchEvent` (real touch path).
- Full suite: `npx vitest run`, `npx playwright test`, `npm run build`, `npx oxlint`.
- Phone-size check in the built-in browser; commit own files by name; push `main`; confirm Actions deploy.
