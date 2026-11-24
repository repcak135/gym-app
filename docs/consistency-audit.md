# Przegląd spójności (2026-11-24, wersja 0.9.0)

Funkcje, które istniały w jednym miejscu, a w jego „bliźniaku” nie. Zasada naprawy: jeden wspólny komponent zamiast dwóch kopii, żeby miejsca nie rozjechały się znowu.

| Miejsce | Bliźniak | Różnica | Naprawa |
|---|---|---|---|
| Wybór ćwiczeń (plan, trening) | Zakładka Ćwiczenia | Picker miał tylko wyszukiwarkę i zakres; brak filtrów „Mięśnie” / „Sprzęt”, przycisku × w wyszukiwarce i „Ostatnio używane” | Wspólny `ExerciseFinder` + `useExerciseFinder` (zakres, wyszukiwarka z ×, filtry, arkusze filtrów, ostatnio używane) w obu miejscach |
| Wybór ćwiczeń | Zakładka Ćwiczenia | Wiersz ćwiczenia zbudowany dwa razy (zdjęcie, nazwa, polska nazwa, „Własne”, mięśnie · sprzęt) | Wspólny `ExerciseRowContent` |
| Zamiana ćwiczenia w treningu | — | Wyniki alfabetycznie, ćwiczenia na zamieniany mięsień ginęły w liście (uwaga znajomego) | Tryb zamiany w pickerze: „Podobne (barki)” na górze (ten sam mięsień, potem ten sam sprzęt, potem używane), niżej „Pozostałe”; `rankForSwap` + test |
| Wybór ćwiczeń / Ćwiczenia | — | Pusta lista: picker „Brak wyników.”, zakładka — sam licznik „0 ćwiczeń” | Wspólny `FinderEmpty`: „Brak ćwiczeń dla tego wyszukiwania.” + „Wyczyść wyszukiwanie i filtry” |
| Arkusz „i” w treningu | Karta ćwiczenia | W treningu brak zdjęć, rad, instrukcji i rekordów | Nowa zakładka „Opis” (`ExerciseHowTo`: zdjęcia, mięśnie, rady, instrukcja) i `RecordsSection` w „Statystykach” |
| Karta ćwiczenia | Arkusz „i” w treningu | Na karcie brak wykresu ciężaru / szac. 1RM | Wspólny `ExerciseProgressChart`, sekcja „Postęp” na karcie |
| Notatka w treningu | Notatka na karcie | Dwie osobne implementacje zapisu; tylko karta pokazywała „Zapisano” | Wspólny `NoteEditor` |
| Szczegóły treningu (Historia) | Historia ćwiczenia | Serie jako „40 kg × 8” + litera „R”; historia ćwiczenia pisze „× 8 powt.” i „Rozgrzewka · RPE 8” | Ten sam zapis w szczegółach treningu |
| Wyślij plan | Wyślij ćwiczenia | Ten sam kod QR / Udostępnij / Kopiuj / pole z linkiem skopiowany dwa razy | Wspólny `ShareLinkPanel` |
| Karta ćwiczenia (usuń) | Reszta aplikacji | Własna kopia arkusza potwierdzenia | Wspólny `ConfirmSheet` |
| Wklej link (Plany) | Nazwa planu / dnia, „USUŃ” | Arkusz z polem tekstowym otwierał się na dole (klawiatura iPhone'a mogła go zasłonić) | `sheet-backdrop--top`, jak inne arkusze do pisania |
| Liczby mnogie | — | 7 lokalnych kopii odmiany (serie, treningi, ćwiczenia, dni, „robocze”) | Wszystko z `src/data/plural.ts` (+ test) |
| Wersja w kopii zapasowej | Ustawienia | Wersja czytana z `package.json` w kodzie danych | Jedno źródło: `package.json` → `__APP_VERSION__` (`src/version.ts`) |

Sprawdzone i spójne (bez zmian): przesuwanie w bok do usuwania jest na każdej liście z danymi użytkownika (plany, dni, ćwiczenia w dniu, historia, pomiary, moje ćwiczenia), a w szczegółach zawsze jest też zwykły przycisk; pełnoekranowe okna (picker) i arkusze mają odstępy dla paska stanu i dolnej krawędzi iPhone'a; etykiety RPE wszędzie z `rirToRpeLabel`.
