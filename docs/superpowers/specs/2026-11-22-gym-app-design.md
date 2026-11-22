# Gym app — dokument projektu

Data: 2026-11-22 · Status: zaakceptowany przez właściciela 2026-11-22

## Po co

Właściciel trenuje regularnie (ok. 8 treningów w miesiącu, plan Upper / Legs itd.) i używa komercyjnej aplikacji treningowej. Problemy z nią: część funkcji za opłatą, czasem się zacina. Chce własnej aplikacji, bo to też fajny projekt, i chce dawać ją znajomym (iPhone i Android).

Sukces: właściciel przestaje używać starej aplikacji i loguje w nowej każdy trening, bez zacięć, a znajomi instalują ją z linku.

## Cele

- Działa na iPhonie i Androidzie, instalowana z linku na ekran główny (PWA).
- Wszystkie funkcje darmowe, zero kosztów (bez Maca, bez konta Apple Developer, bez płatnych usług).
- Działa offline na siłowni (słaby zasięg); dane w telefonie.
- Szybka i stabilna w trakcie treningu: wpisanie serii to 1–2 dotknięcia.

## Nie-cele (na teraz)

- Serwer, konta, logowanie, synchronizacja między urządzeniami, podgląd treningów znajomych. Może później (np. Azure), więc warstwa danych ma być wydzielona, żeby dało się ją dołożyć.
- Publikacja w App Store / Google Play.
- Trener AI, zegarki, wiele języków.

## Anty-cele (porażka, nawet jeśli „działa”)

- Utrata danych treningowych (np. po zamknięciu aplikacji w trakcie treningu lub po aktualizacji).
- Zacinanie się lub wolne reagowanie w trakcie treningu.
- Cokolwiek zablokowanego, reklamy, wymóg logowania.

## Ograniczenia

- Koszt 0 zł. Hosting darmowy.
- Ograniczenie iOS dla PWA: przy zablokowanym ekranie dźwięk końca przerwy może nie zagrać; wibracja działa tylko na Androidzie. Akceptujemy.
- Obrazki ćwiczeń tylko z wolnego źródła. Nie wolno używać obrazków z obecnej aplikacji właściciela, z MuscleWiki ani z openGym (Gym visual).
- Kod openGym (AGPL-3.0) wolno wykorzystać, jeśli coś jest tam lepsze. Wtedy nasze repo staje się publiczne na AGPL-3.0 — właściciel się na to zgadza.

## Sposoby budowy (rozważone)

| | Opis | Za | Przeciw |
|---|---|---|---|
| **A (wybrane)** | Aplikacja webowa PWA, dane w telefonie (IndexedDB), darmowy hosting statyczny | 0 zł, jeden kod na oba systemy, działa offline, prosta | brak synchronizacji i wspólnych danych; ograniczenia iOS przy zablokowanym ekranie |
| B | A + serwer na Azure (konta, synchronizacja, znajomi) | wspólne dane, kopia w chmurze | logowanie, baza, ok. 2× więcej pracy; darmowe limity mogą się skończyć |
| C | Natywne aplikacje w sklepach | pełne powiadomienia | wymaga Maca i 99 USD/rok — odpada |

Rozważony też fork openGym: wymaga serwera działającego cały czas, jest bardzo duży, jego obrazki i tak trzeba wymienić, a właściciel chce własny projekt. Bierzemy z niego pomysły (i ewentualnie kawałki kodu).

## Funkcje (v1)

### 1. Ćwiczenia
- Baza 876 ćwiczeń z [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (licencja Unlicense = domena publiczna, sprawdzone 2026-11-22; repo nie podaje osobnego źródła zdjęć): nazwa (angielska), mięśnie główne i pomocnicze, sprzęt, poziom, instrukcja, zdjęcia.
- Lista z wyszukiwarką, filtrami „Mięśnie” i „Sprzęt”, sekcją „Ostatnio używane” (jak na screenach obecnej aplikacji).
- Karta ćwiczenia: zdjęcia, instrukcja, **rady po polsku** (np. kąt ławki, ustawienie łokci), mięśnie, **notatka właściciela** (osobna dla każdego ćwiczenia, edytowalna, widoczna też w trakcie treningu).
- Rady po polsku pisze Claude — najpierw dla ćwiczeń z planu właściciela, potem stopniowo dla reszty. Ćwiczenie bez rad po prostu ich nie pokazuje.
- Tworzenie własnego ćwiczenia (nazwa, mięśnie, sprzęt, notatka).

### 2. Plany
- Plan ma nazwę, datę startu i dni (np. „Day 1 Upper”, „Day 2 Legs 1”). Jeden plan aktywny.
- Dzień ma listę ćwiczeń; każde: liczba serii, zakres powtórzeń (np. 10–12), ile serii rozgrzewkowych, czas przerwy (np. 2:00, 3:00), kolejność (przeciąganie).
- Tworzenie, edycja, kopiowanie i usuwanie planów i dni.

- **Ustawienia** (dodane na prośbę właściciela 2026-11-22, etap 3): ekran „Ustawienia” (zębatka na ekranie Start). Domyślne wartości dla nowo dodanych ćwiczeń w planie: przerwa (2:00), serie (3), serie rozgrzewkowe (0), zakres powtórzeń (8–12); domyślny krok ciężaru (2,5 kg) i waga gryfu (20 kg, do kalkulatora talerzy). Zmiana ustawień nie zmienia ćwiczeń już zapisanych w planach; wartości przy konkretnym ćwiczeniu w planie mają pierwszeństwo.

### 3. Trening na żywo
- Start z dnia planu albo pusty trening.
- Przesuwanie między ćwiczeniami (kropki u góry), licznik czasu całego treningu.
- Seria: ciężar (kg, przyciski −/+ i wpisywanie) i powtórzenia, oznaczenie „rozgrzewka”, przycisk „Zalicz serię”.
- **Wartości wpisane z góry** z ostatniego treningu tego ćwiczenia + **podpowiedź progresji** (np. „ostatnio 35 kg × 8 w górnej granicy zakresu → spróbuj 37,5 kg”; niezaliczone powtórzenia nigdy nie podnoszą ciężaru — pomysł z openGym).
- Przy ćwiczeniu: „Historia” (poprzednie treningi tego ćwiczenia), „Notatki”, „Statystyki” (wykres ciężaru / szacowanego maksimum w czasie).
- **Licznik przerwy** startuje po zaliczeniu serii: pasek na dole, można pominąć lub wydłużyć; na koniec dźwięk + wibracja (Android). Liczony z godziny rozpoczęcia, nie „tyknięć”, żeby był poprawny po wyjściu z aplikacji.
- Dodanie / zamiana / usunięcie ćwiczenia w trakcie treningu.
- **Ekran nie gaśnie** w trakcie treningu (Wake Lock API).
- **Wznawianie:** każda seria zapisuje się od razu; po zamknięciu aplikacji trening wraca dokładnie tam, gdzie był.
- Podsumowanie po treningu: czas, serie, objętość, **nowe rekordy**.

### 4. Historia
- Kalendarz miesięczny z kropkami w dni treningowe, pod nim lista treningów (data, nazwa dnia).
- Szczegóły treningu: wszystkie ćwiczenia i serie; edycja i usuwanie.

### 5. Rekordy
- Na ćwiczenie: najcięższa seria, najwięcej powtórzeń przy danym ciężarze, szacowany ciężar maksymalny (1RM, wzór Epleya), największa objętość.
- Rozgrzewki nie liczą się do rekordów ani statystyk.

### 6. Statystyki
- Okres: tydzień / miesiąc / rok / wszystko, przełączanie strzałkami.
- Kafelki: liczba treningów, łączny czas, średni czas treningu, liczba serii.
- Wykres kołowy „serie na mięsień” (grupy: klatka, plecy, barki, nogi, biceps, triceps, brzuch, łydki, pośladki, przedramiona), przełącznik mięśnie główne / pomocnicze.
- **Sylwetka z mięśniami** (przód i tył): kolor zależy od liczby serii w okresie; dodatkowy tryb „dawno nietrenowane” (pomysł z openGym). Biblioteka: `react-body-highlighter` 2.0.5 (MIT, sprawdzone 2026-11-22; ostatnie wydanie 2021, React ≥16). Jeśli nie zadziała z aktualnym Reactem, kopiujemy jej rysunki SVG do własnego komponentu (MIT pozwala).
- Treningi w tygodniu (wykres słupkowy).

### 7. Dodatki
- **Kalkulator talerzy:** ciężar docelowy → jakie talerze na każdą stronę (gryf 20 kg domyślnie, zestaw talerzy do ustawienia).
- **Kopia zapasowa:** eksport wszystkich danych do pliku JSON i import; przypomnienie, jeśli ostatnia kopia jest starsza niż 14 dni. Aplikacja prosi przeglądarkę o trwałe przechowywanie danych.
- **Wysyłanie planu znajomemu:** link (plan zakodowany w adresie) i kod QR; otwarcie linku pokazuje podgląd i „Dodaj plan”.

### 8. Import historii z obecnej aplikacji
Eksport właściciela (`gym-day.csv`, sprawdzony 2026-11-22): kolumny `Date, Workout name, Exercise, Set, Weight, Reps, Distance, Duration, Measurement unit, Notes`; 7255 serii, 297 treningów od 16.01.2025 do 20.11.2026, 79 różnych ćwiczeń, wszystko w kg; kolumny Distance, Duration i Notes są puste.
- Jeden trening = wiersze z tą samą datą i godziną; nazwa dnia z „Workout name”.
- **Dopasowanie ćwiczeń:** tylko 15 z 79 nazw pasuje dokładnie do bazy. Aplikacja dopasowuje automatycznie (dokładnie, potem podobne nazwy), a resztę pokazuje na ekranie „Dopasuj ćwiczenia”: przy każdej nazwie propozycja z bazy, do zmiany, albo „utwórz jako własne” (np. „Wiosło Krzywe”, „Tokarski lateral raises”). Dopasowania zapamiętywane, żeby ponowny import nie pytał drugi raz.
- Ograniczenia eksportu: brak oznaczenia rozgrzewki (wszystkie serie importują się jako robocze; można poprawić ręcznie), brak czasu trwania treningu (zaimportowane treningi nie liczą się do statystyk czasu), brak planu (plan właściciel wpisuje sam — to też test aplikacji).
- Ponowny import tego samego pliku nie dubluje treningów.
- Prywatność: prawdziwy plik właściciela nie trafia do repo (repo może być publiczne); testy używają małej, zmyślonej próbki w tym samym formacie.

### Później (nie v1)
- **Dopracowanie i animacje** (prośba właściciela 2026-11-22): przesunięcie planu / dnia / ćwiczenia w bok odsłania czerwony przycisk usuwania (z możliwością cofnięcia), płynne przejścia między ekranami i przy zaliczaniu serii. Osobny etap po etapie 7.
- Waga ciała i pomiary (zakładka „Body” jak w obecnej aplikacji).
- Serwer / synchronizacja / znajomi (sposób B).

## Wygląd

**Własny wygląd** (decyzja właściciela), **ciemny motyw** (życzenie właściciela); szczegóły projektu graficznego zostawione Claude'owi. Duże przyciski do obsługi jedną ręką, czytelne liczby (ciężar, powtórzenia, licznik przerwy), wyraźny kolor dla zaliczonych serii. Dolne menu: **Start, Plany, Ćwiczenia, Historia, Statystyki**. Nie wzorujemy się wizualnie na obecnej aplikacji właściciela.

Ekran „Start”: przycisk „Rozpocznij następny trening” (kolejny dzień planu), ostatni trening, liczba treningów w tym tygodniu.

## Decyzje techniczne (decyzje Claude'a, nie właściciela)

- React + TypeScript + Vite, `vite-plugin-pwa` (instalacja, działanie offline).
- Dane: IndexedDB przez Dexie; cała logika danych w jednym module (`src/data/`), żeby później dało się dodać synchronizację.
- Zdjęcia ćwiczeń: ładowane z GitHuba free-exercise-db i zapisywane w pamięci podręcznej po pierwszym wyświetleniu; zdjęcia ćwiczeń z aktywnego planu pobierane z góry, żeby działały offline na siłowni.
- Wykresy: lekka biblioteka (np. Recharts); ikony: lucide.
- Testy: Vitest dla logiki (statystyki, rekordy, progresja, kalkulator talerzy, kodowanie planu w linku), Playwright dla głównych ścieżek na ekranie telefonu.
- Hosting: GitHub Pages (repo publiczne) albo Azure Static Web Apps (darmowy plan, działa też z prywatnym repo). Wybór przy etapie 1.
- Język interfejsu: polski; nazwy ćwiczeń po angielsku (z bazy, tak jak w obecnej aplikacji).
- Jednostki: kg; krok ciężaru domyślnie 2,5 kg, do zmiany przy ćwiczeniu.

## Etapy (jeden etap = jedna sesja)

1. Szkielet: projekt, ciemny wygląd, dolne menu, instalacja na telefonie, hosting.
2. Ćwiczenia: import bazy, lista, filtry, karta ćwiczenia, notatki, rady po polsku (dla ćwiczeń z planu), własne ćwiczenia.
3. Plany: tworzenie i edycja planu, dni i ćwiczeń (właściciel testuje, wpisując swój plan).
4. Trening na żywo: serie, rozgrzewka, licznik przerwy, wartości z ostatniego razu, progresja, wznawianie, wake lock, podsumowanie.
5. Historia, rekordy i import historii z obecnej aplikacji (od razu prawdziwe dane do statystyk).
6. Statystyki z wykresem kołowym i sylwetką.
7. Dodatki: kalkulator talerzy, kopia zapasowa, wysyłanie planu.

Po każdym etapie Claude sprawdza aplikację na ekranie wielkości telefonu i uruchamia testy; właściciel testuje na swoim iPhonie przy etapach 3, 4 i 7.

## Ustalenia po przeglądzie (decyzje Claude'a)

- **Progresja (podwójna):** jeśli w ostatnim treningu wszystkie serie robocze osiągnęły górną granicę zakresu powtórzeń → podpowiedź „+ krok ciężaru”; w przeciwnym razie ten sam ciężar i „spróbuj +1 powtórzenie”. Serie niezaliczone (poniżej dolnej granicy) nigdy nie podnoszą ciężaru. Podpowiedź to tylko sugestia, nie zmienia planu.
- **Rady po polsku:** Claude pisze je w etapie 2 jako plik danych w repo (`src/data/tips-pl.json`, klucz = id ćwiczenia), bez osobnej akceptacji właściciela; właściciel może poprawiać przez notatki, a Claude dopisuje kolejne w dowolnym etapie.
- **Kalkulator talerzy:** jedno ustawienie w aplikacji (waga gryfu, dostępne talerze), z możliwością podania innej wagi gryfu przy konkretnym ćwiczeniu.
- **Udostępniony plan:** po dodaniu jest niezależną kopią u odbiorcy (może go dowolnie zmieniać), bez powiązania z oryginałem.
- **Plan właściciela:** właściciel wpisze go sam w etapie 3 (to test tworzenia planów). Claude nie odtwarza planu.

## Pozostawione budującemu

Dokładny układ ekranów, kolory, nazwy plików, struktura komponentów, wybór biblioteki wykresów, mapowanie nazw mięśni z bazy na grupy i na sylwetkę, wzór podpowiedzi progresji w szczegółach.
