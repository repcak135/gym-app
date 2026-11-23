# Etap 7a: kopia zapasowa i kalkulator talerzy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kopia zapasowa wszystkich danych do jednego pliku JSON (udostępnianie na iPhonie, pobranie gdzie indziej), przywracanie z podglądem i bez ryzyka utraty danych, przypomnienie na Starcie, kalkulator talerzy z ekranu treningu i z Ustawień.

**Architecture:** Logika w `src/data/` (czyste funkcje + Dexie, testowane Vitestem): `backup.ts` (format, eksport, walidacja, przywracanie w jednej transakcji), `plates.ts` (matematyka talerzy). UI: nowa strona `/ustawienia/kopia`, baner na Starcie, arkusz `PlateCalculatorSheet` otwierany z edytora serii i z Ustawień.

**Tech Stack:** React 19, TypeScript, Dexie 4, Vitest + fake-indexeddb, Playwright (iPhone 13, chromium), lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-22-gym-app-design.md` (7. Dodatki, Ustalenia: kalkulator talerzy)

## Global Constraints

- Dane tylko na telefonie; nic nie jest wysyłane (share sheet/pobranie pliku to akcja użytkownika).
- Interfejs po polsku, liczby z przecinkiem (`formatKg`), ciemne tokeny z `src/theme/tokens.css`, safe-area iPhone'a (`env(safe-area-inset-*)`).
- Plik kopii: `gym-kopia-YYYY-MM-DD.json` (data lokalna).
- Kopia = wszystkie tabele poza wbudowanym katalogiem ćwiczeń; własne ćwiczenia w całości; z wbudowanych tylko nadpisania użytkownika (`weightStep`, `barWeight`).
- Przypomnienie: brak kopii albo starsza niż 14 dni; „Później” ukrywa na 3 dni.
- Talerze domyślnie 25/20/15/10/5/2,5/1,25 kg; gryf z ćwiczenia (`exercise.barWeight`) albo z Ustawień.

## Review Focus

- Zły plik (nie JSON, inny JSON, uszkodzone tabele, kopia z nowszej wersji) → czytelny błąd, baza nietknięta. Test: `restoreBackup` z błędnymi wierszami nie zmienia danych (transakcja przerwana).
- `navigator.share` na iPhonie wymaga gestu; po asynchronicznym przygotowaniu pliku może rzucić `NotAllowedError` → wtedy przycisk „Zapisz plik” wywołuje share bezpośrednio. Anulowanie share sheet (`AbortError`) nie ustawia `lastBackupAt`.
- Przywrócenie nie psuje katalogu: `exerciseDbVersion` zostaje z urządzenia, wbudowane ćwiczenia zostają, ich nadpisania są zastępowane tymi z kopii.
- Ciężar nieosiągalny (np. 101 kg) albo mniejszy niż gryf → najbliższy niższy i wyższy możliwy ciężar, bez wieszania się.
- Pusty nowy użytkownik (0 treningów) nie widzi banera przypomnienia.

---

### Task 1: Format i logika kopii (`src/data/backup.ts`)

**Files:** Create `src/data/backup.ts`, `src/data/backup.test.ts`; modify `src/data/types.ts` (`AppSettings.backupReminderSnoozedUntil?: number`), `package.json` (`version` → `0.7.0`).

**Interfaces (Produces):**
- `BACKUP_FORMAT_VERSION = 1`, `APP_VERSION: string` (z `package.json`)
- `interface BackupFile { app: 'gym-app'; formatVersion: number; appVersion: string; exportedAt: number; data: BackupData }`
- `interface BackupData { plans; workouts; sets; notes; aliases; body; customExercises: Exercise[]; exerciseOverrides: {id; weightStep?; barWeight?}[]; settings: Partial<AppSettings> }` (settings bez `key`, `exerciseDbVersion`, `lastBackupAt`, `backupReminderSnoozedUntil`)
- `createBackup(now?: number): Promise<BackupFile>`
- `backupFileName(d: Date): string`
- `class BackupError extends Error` (komunikat po polsku)
- `parseBackup(text: string): BackupFile` — JSON → walidacja → migracja (brakujące tabele z wcześniejszych wersji = `[]`); `formatVersion > BACKUP_FORMAT_VERSION` → błąd „nowsza wersja aplikacji”.
- `summarizeBackup(f): { plans; workouts; sets; measurements; customExercises; exportedAt }`
- `restoreBackup(f): Promise<void>` — jedna transakcja `rw` na wszystkich tabelach: czyści tabele użytkownika i własne ćwiczenia, zdejmuje nadpisania z wbudowanych, wkłada dane z kopii; ustawienia = `DEFAULT_SETTINGS + kopia`, `exerciseDbVersion` z urządzenia, `lastBackupAt = exportedAt`.
- `markBackupDone(now)`, `snoozeBackupReminder(now)` (+3 dni), `backupReminderDue(settings, hasWorkouts, now): boolean`

- [ ] Testy: round-trip każdej tabeli (plany, treningi, serie, notatki, aliasy, ciało, własne ćwiczenie, nadpisanie wbudowanego, ustawienia) — po `restoreBackup` na wyczyszczonej/zmienionej bazie wszystko równe oryginałowi, wbudowane ćwiczenia zostają; nazwa pliku `gym-kopia-2026-11-05.json`; plik bez tabeli `body` (starsza kopia) → `[]`; `formatVersion: 99` → `BackupError`; nie-JSON, `{}` i `sets: "x"` → `BackupError`; wiersz serii bez `id` w kopii → `restoreBackup` rzuca i baza ma stare dane; reguły przypomnienia (nigdy, 13 dni, 15 dni, odłożone, 0 treningów).
- [ ] Implementacja, `npx vitest run src/data/backup.test.ts` PASS, commit.

### Task 2: Zapis pliku i strona „Kopia zapasowa”

**Files:** Create `src/data/backupShare.ts`, `src/pages/BackupPage.tsx`, `src/pages/BackupPage.css`, `src/components/BackupReminder.tsx`; modify `src/App.tsx` (trasa `/ustawienia/kopia`), `src/pages/SettingsPage.tsx` (wiersz „Kopia zapasowa” w grupie Dane), `src/pages/StartPage.tsx` (baner).

**Interfaces:** `saveBackupFile(f: BackupFile): Promise<'shared' | 'downloaded' | 'cancelled' | 'needs-tap'>` — `navigator.canShare({files})` → `share`; `AbortError` → `cancelled`; `NotAllowedError` → `needs-tap`; brak wsparcia → link `download`. Hook `useMakeBackup()` → `{ run, status, retry }` używany przez stronę i baner.

- [ ] Strona: „Zrób kopię”, „Ostatnia kopia: …/jeszcze nie”, „Przywróć z kopii” (`<label>` z `<input type="file">` bez `accept`, działa w iOS standalone), arkusz podglądu (data kopii, plany, treningi, serie, pomiary, własne ćwiczenia) → „Zastąp wszystko” → drugi krok z ostrzeżeniem i „Tak, zastąp moje dane”; błędy w `role="alert"`.
- [ ] Baner na Starcie (gdy `backupReminderDue`): „Zrób kopię” i „Później”.
- [ ] Playwright `e2e/backup.spec.ts`: baner widoczny przy treningu i braku kopii; „Zrób kopię” pobiera plik `gym-kopia-*.json` (chromium bez share files → download) i baner znika; zmiana danych, „Przywróć z kopii” z pobranym plikiem → podgląd z liczbami → zastąp → dane wróciły; zły plik → komunikat, dane bez zmian.

### Task 3: Matematyka talerzy (`src/data/plates.ts`)

**Interfaces:** `calculatePlates(target: number, bar: number, plates: number[]): PlateResult`, `PlateResult = { exact: boolean; perSide: number[]; total: number; lower?: PlateOption; higher?: PlateOption }`, `PlateOption = { perSide: number[]; total: number }`. Nieograniczona liczba par każdego talerza; programowanie dynamiczne na jednostkach 0,05 kg (setne kg × 100), minimalna liczba talerzy, talerze malejąco. `target <= bar` → sam gryf (`exact` gdy równy). Gdy nie ma dokładnego: `perSide/total` = najbliższy (remis → niższy), `lower`/`higher` obie opcje.

- [ ] Testy: 100 kg/20/domyślne → `[25, 15]`; 60 → `[20]`; 20 → `[]`; 101 → nie exact, lower 100, higher 102,5; 15 przy gryfie 20 → `[]`, total 20; talerze `[15, 10]`, 60 kg → `[10, 10]` (greedy by zawiódł); pusta lista talerzy → sam gryf; 1,25 → 22,5 kg = `[1.25]`.

### Task 4: Kalkulator w UI

**Files:** Create `src/components/PlateCalculatorSheet.tsx` + `.css`; modify `src/components/workout/ExercisePanel.tsx` (ikona `Calculator` przy „Ciężar (kg)”), `src/pages/WorkoutPage.tsx`, `src/pages/SettingsPage.tsx` (grupa Ciężar: „Kalkulator talerzy”, edytowalna lista talerzy — chipy z × i pole „Dodaj talerz”).

**Interfaces:** `PlateCalculatorSheet({ initialWeight?, exercise?, onUse?(kg), onClose })` — pole „Ciężar docelowy”, wybór gryfu (zmiana przy ćwiczeniu zapisuje `exercise.barWeight`), talerze na stronę jako chipy, rysunek sztangi (talerze jako prostokąty, wysokość wg ciężaru), przy braku dokładnego: „Nie da się dokładnie. Najbliżej: X kg lub Y kg” z przyciskami wyboru, z treningu „Użyj X kg”.

- [ ] Playwright w `e2e/backup.spec.ts` (lub `plates.spec.ts`): z Ustawień 100 kg → „25 + 15” na stronę; 101 → komunikat o najbliższym; z treningu „Użyj” ustawia ciężar serii.

### Task 5: Sprawdzenie i wydanie

- [ ] `npx vitest run`, `npx playwright test`, `npm run build`, `npm run lint` — wszystko zielone.
- [ ] Podgląd w przeglądarce na 375×812 (Ustawienia > Kopia, baner, kalkulator).
- [ ] Commit, push na `main`, sprawdzenie, że Actions wdrożyło (nowa wersja na https://repcak135.github.io/gym-app/).
