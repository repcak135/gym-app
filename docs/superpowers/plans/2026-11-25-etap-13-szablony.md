# Etap 13 — szablony planów — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plany → „Dodaj z szablonu”: three ready plans (FBW dla początkujących — kobiety / — mężczyźni, Plan 4-dniowy dla średnio zaawansowanych) with a friendly Polish description; adding one creates an editable copy.

**Architecture:** Static data `src/data/templates.ts` (no DB change) + `createPlanFromTemplate(id)` in the same file using the existing plan functions/table. UI: new page `/plany/szablony` (list + details) linked from PlansPage.

**Tech Stack:** React 19, TS, Dexie, Vitest, Playwright.

**Spec:** task brief part 3; inspiration only from a private book digest (never committed, never copied). ALL texts below are our own words.

## Global Constraints

- Never copy the book's text; credit line exactly: `Inspirowane książką „Fundamenty Treningu Siłowego” (Michał Sakowski)`.
- Private files under `C:\Claude\gym-app-private` are never read by the app nor committed.
- Rest for every item = `settings.defaultRestSec`; warm-up sets 0 (the description points to the „Rozgrzewka” button).
- A template exercise id missing from `db.exercises` → first existing id from its `fallback` list → otherwise the item is skipped (never crash).
- Plank items are time-measured: `targetSec: 30` (Task 1 of etap 12 adds `targetSec`; if the plank's measure is not `time`, the field is harmless).
- Release: next 0.9.x + Polish changelog entry.

## Review Focus

- Adding the same template twice → two separate plans (`… (2)` name suffix like copyPlan does, or same name — must not overwrite).
- User with no active plan → the new plan becomes active; with an active plan → ask nothing, keep the current active plan, show `Ustaw jako aktywny` on the plan (existing behaviour).
- Fallback path when an exercise id was merged/removed in a future catalogue version.
- Long description on a 375 px phone: scrolls, buttons reachable above the bottom nav / safe area.
- Plan share/backup of a template-made plan works like any plan (plain plan data).

---

### Task 1: Template data + createPlanFromTemplate

**Files:** Create `src/data/templates.ts`, `src/data/templates.test.ts`.

**Interfaces:**
```ts
export interface TemplateItem { exerciseId: string; fallback?: string[]; sets: number; repsMin: number; repsMax: number; targetSec?: number }
export interface TemplateDay { name: string; note: string; items: TemplateItem[] }
export interface PlanTemplate { id: string; name: string; tagline: string; description: string[]; days: TemplateDay[] }
export const TEMPLATE_CREDIT = 'Inspirowane książką „Fundamenty Treningu Siłowego” (Michał Sakowski)';
export const PLAN_TEMPLATES: PlanTemplate[];
export async function createPlanFromTemplate(templateId: string): Promise<Plan>; // new id, startedAt today, days/items copied with new ids, restSec from settings, warmupSets 0
```

Data (exercise ids; `→` = fallback list):

**`fbw-women` — „FBW dla początkujących — kobiety”**, tagline `3 treningi w tygodniu, całe ciało, na zmianę A i B`.
- Day `A`, note `Przysiad, wyciskanie, wiosłowanie + dodatki`: Barbell_Squat 5×5–5; Barbell_Bench_Press_-_Medium_Grip 5×5–5; Bent_Over_Barbell_Row 5×5–5; Side_Lateral_Raise 3×8–10; Barbell_Hip_Thrust 3×8–10 (→ x-dumbbell-hip-thrust); Cable_Crunch 3×8–10; Standing_Calf_Raises 3×8–10.
- Day `B`, note `Martwy ciąg, wyciskanie nad głowę, podciąganie + dodatki`: Barbell_Deadlift 5×5–5; Standing_Military_Press 5×5–5; Chin-Up 5×5–5 (→ Close-Grip_Front_Lat_Pulldown); Dumbbell_Rear_Lunge 3×8–10 (→ Crossover_Reverse_Lunge); Thigh_Abductor 3×8–10 (→ x-cable-hip-abduction); Plank 3 sets targetSec 30 (repsMin/Max 8/12 placeholders); Standing_Calf_Raises 3×8–10.

**`fbw-men` — „FBW dla początkujących — mężczyźni”**, same tagline.
- Day `A`: Barbell_Squat 5×5; Barbell_Bench_Press_-_Medium_Grip 5×5; Bent_Over_Barbell_Row 5×5; Side_Lateral_Raise 3×8–10; Barbell_Curl 3×8–10; Triceps_Pushdown 3×8–10; Cable_Crunch 3×8–10; Standing_Calf_Raises 3×8–10.
- Day `B`: Barbell_Deadlift 5×5; Standing_Military_Press 5×5; Chin-Up 5×5 (→ Close-Grip_Front_Lat_Pulldown); Close-Grip_Barbell_Bench_Press 3×8–10; Dumbbell_Bicep_Curl 3×8–10; Plank 3 × targetSec 30; Standing_Calf_Raises 3×8–10.

**`intermediate-4` — „Plan 4-dniowy dla średnio zaawansowanych”**, tagline `4 treningi w tygodniu: dzień siły, nogi, góra i lżejszy dzień całego ciała`.
- Day `1 — Siła (całe ciało)`, note `Ciężko i krótko: 3–5 powtórzeń`: Barbell_Squat 4×3–5; Barbell_Deadlift 4×3–5; Barbell_Bench_Press_-_Medium_Grip 4×3–5; Pullups 4×3–5 (→ Wide-Grip_Lat_Pulldown); Standing_Military_Press 4×3–5; Face_Pull 2×8–10.
- Day `2 — Nogi`, note `Średnio ciężko: 8–10 powtórzeń`: Leg_Press 4×8–10; Romanian_Deadlift 4×8–10; x-dumbbell-bulgarian-split-squat 4×8–10 (→ Split_Squat_with_Dumbbells); Barbell_Hip_Thrust 4×8–10; Lying_Leg_Curls 2×8–10; Standing_Calf_Raises 2×8–10; Cable_Crunch 2×8–10.
- Day `3 — Góra`, note `Średnio ciężko: 8–10 powtórzeń`: Barbell_Bench_Press_-_Medium_Grip 4×8–10; Wide-Grip_Lat_Pulldown 4×8–10; Dumbbell_Shoulder_Press 4×8–10 (→ Standing_Military_Press); Seated_Cable_Rows 4×8–10; Barbell_Curl 2×8–10; Triceps_Pushdown 2×8–10; Side_Lateral_Raise 2×8–10; Face_Pull 2×8–10.
- Day `4 — Lżej (całe ciało)`, note `Lżejszy ciężar, więcej powtórzeń: 12–15`: Leg_Press 2×12–15; Incline_Dumbbell_Press 2×12–15; One-Arm_Dumbbell_Row 2×12–15; Side_Lateral_Raise 2×8–10; Reverse_Flyes 2×8–10; Lying_Leg_Curls 2×8–10; Plank 2 × targetSec 30.

Descriptions (exact copy, paragraphs):

FBW (both; the women's/men's line differs as marked):
1. `Dla kogo: dla osób, które dopiero zaczynają na siłowni albo wracają po dłuższej przerwie.`
2. `Jak często: 3 razy w tygodniu, z dniem odpoczynku pomiędzy (np. pon–śr–pt). Treningi A i B robisz na zmianę: w jednym tygodniu A-B-A, w kolejnym B-A-B. Aplikacja sama podpowie, który dzień jest następny.`
3. `Na czym polega: każdy trening ćwiczy całe ciało. Najpierw trzy główne ćwiczenia po 5 serii po 5 powtórzeń, potem kilka mniejszych ćwiczeń po 3 serie.` + women: ` Dodatki mocniej angażują pośladki i nogi.` / men: ` Dodatki to m.in. ramiona i brzuch.`
4. `Jak zacząć: pierwsze treningi zrób lekko — nawet z samym gryfem — i skup się na technice. Przed głównym ćwiczeniem użyj przycisku „Rozgrzewka”, a aplikacja zaproponuje lżejsze serie.`
5. `Jak robić postępy: w głównych ćwiczeniach, gdy zrobisz wszystkie 5×5, następnym razem aplikacja zaproponuje trochę większy ciężar. W mniejszych ćwiczeniach najpierw dokładasz powtórzenia (do 10), potem ciężar. Gdy przez 3 treningi nic nie rośnie, zobaczysz propozycję, żeby zejść o ok. 10% i zbudować się od nowa.`
6. `Wszystko możesz zmienić: po dodaniu to zwykły plan — zamienisz ćwiczenia, serie i przerwy.`

Intermediate:
1. `Dla kogo: dla osób, które trenują już jakiś czas i ciężar przestał rosnąć z treningu na trening.`
2. `Jak często: 4 razy w tygodniu, np. poniedziałek, środa, czwartek i sobota.`
3. `Na czym polega: każdy dzień ma inne zadanie. Dzień 1 to siła — ciężko, mało powtórzeń (3–5). Dni 2 i 3 to budowa mięśni — średni ciężar, 8–10 powtórzeń; dzień 2 to nogi, dzień 3 górna część ciała. Dzień 4 jest lżejszy — więcej powtórzeń (12–15), żeby ciało odpoczęło, a mimo to pracowało.`
4. `Ćwiczenia dodatkowe: na końcu dni są mniejsze ćwiczenia po 2 serie. Wymień je na te, które Tobie są potrzebne — np. więcej barków albo pośladków.`
5. `Jak robić postępy: aplikacja przy każdej serii podpowie, czy dorzucić powtórzenie, czy ciężar. Ustaw w Ustawieniach, jak ciężko chcesz trenować, i oceniaj trudność serii — podpowiedź to uwzględni.`
6. `Wszystko możesz zmienić: po dodaniu to zwykły plan — zamienisz ćwiczenia, serie i przerwy.`

- [ ] Tests (fake-indexeddb like other data tests, seed the needed exercises): every template exercise id and every fallback exists in the real catalogue files (`exercise-db.json`, `exercises-extra.json`, `exercises-og.json` added, after applying `merged`) — read the JSON in the test; createPlanFromTemplate('fbw-women') → plan with days A/B, 7 + 7 items, rest = settings.defaultRestSec, warmupSets 0, Barbell_Squat 5 sets 5–5; with Barbell_Hip_Thrust removed from db → x-dumbbell-hip-thrust used; with an id and all fallbacks missing → item skipped; two calls → two plans with different ids; no description paragraph contains the word „Sakowski” except the credit constant. Run → FAIL → implement → PASS. Commit `feat: plan templates (data)`.

### Task 2: „Dodaj z szablonu” UI

**Files:** Create `src/pages/PlanTemplatesPage.tsx` (+ CSS). Modify `src/App.tsx` (route `/plany/szablony`), `src/pages/PlansPage.tsx` (button `Dodaj z szablonu` next to `Dodaj plan z linku`/`Skanuj kod QR`, same style; also offered in the empty state), e2e `e2e/templates.spec.ts` (add to `testMatch` in `playwright.config.ts`).
- List: one card per template (name, tagline, `{n} dni · {m} ćwiczeń`). Tap → details on the same page (or a sheet): name, description paragraphs, days with notes and their exercises (Polish name when `namePl`, else name; sets × reps or `3 × 30 s` for targetSec), credit line in small muted text at the bottom, primary button `Dodaj ten plan`.
- `Dodaj ten plan` → `createPlanFromTemplate` → if no active plan, set it active (`setActivePlan`) → navigate to the new plan's page; toast/heading shows it.
- [ ] e2e: Plany → `Dodaj z szablonu` → 3 templates listed → open „FBW dla początkujących — kobiety” → credit text visible → `Dodaj ten plan` → plan page heading `FBW dla początkujących — kobiety` with days `A` and `B`; day A shows `Barbell Squat` (or its Polish name) with `5 × 5`. Run → green. Phone 375 px check. Commit `feat: Dodaj z szablonu (plan templates)`.

### Task 3: Release (main session)

- [ ] Version + changelog (`Gotowe plany do wyboru: FBW dla początkujących (wersje dla kobiet i mężczyzn) i plan 4-dniowy dla średnio zaawansowanych — z opisem, dla kogo są i jak z nimi robić postępy.`), full tests, build, phone check, commit, push, deploy confirmed.
