// "Co nowego" — what changed in each version, in plain Polish for the people using the app.
// Newest first. Every user-visible release bumps the version in package.json and adds an entry here.

export interface ChangelogEntry {
  /** Same as package.json, e.g. "0.9.0". */
  version: string;
  /** Release day, YYYY-MM-DD. */
  date: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.9.14',
    date: '2026-11-26',
    items: [
      'Naprawiony błąd: po powrocie do aplikacji ekran treningu potrafił się wyłożyć („Coś poszło nie tak”). Trening, który się zepsuł, otwiera się już normalnie.',
    ],
  },
  {
    version: '0.9.13',
    date: '2026-11-26',
    items: [
      'Zamiast pustego ekranu przy błędzie aplikacja pokazuje, co się stało, i przycisk „Wróć na Start” (albo „Napraw”). Dane zostają nietknięte.',
    ],
  },
  {
    version: '0.9.12',
    date: '2026-11-26',
    items: [
      'Po końcu przerwy pasek na dole zostaje: „Koniec przerwy +0:45” na zielono — widać, ile minęło. Znika przy następnej serii albo po „Zamknij”.',
    ],
  },
  {
    version: '0.9.11',
    date: '2026-11-26',
    items: [
      'Przerwę widać na każdym ekranie — np. w Statystykach czy Historii pasek z czasem jest nad dolnym menu. Dotknij czasu, żeby wrócić do treningu.',
      'Dźwięk i „Koniec przerwy!” działają też wtedy, gdy nie jesteś na ekranie treningu.',
    ],
  },
  {
    version: '0.9.10',
    date: '2026-11-26',
    items: [
      'Trening nic nie zmienia sam: na start każda seria ma dokładnie to samo, co ostatnio.',
      'Podpowiedź progresji jest tylko propozycją — przycisk „Zastosuj” obok niej wpisze ją do serii, jeśli chcesz.',
      'iPhone: aplikacja nie zatrzymuje już muzyki (np. Spotify) — ani po powrocie do niej, ani na koniec przerwy. Dźwięk na moment ją ścisza. Kto woli dźwięk mimo wyciszonego telefonu: Ustawienia › Koniec przerwy › „Graj przy wyciszonym iPhonie” (wtedy muzyka się zatrzyma).',
    ],
  },
  {
    version: '0.9.9',
    date: '2026-11-26',
    items: [
      'Polskie nazwy ćwiczeń są teraz na pierwszym miejscu — w liście, treningu, planach, historii i statystykach. Angielska nazwa jest mniejsza, pod spodem.',
      'Wyszukiwarka dalej zna obie nazwy i slang. Ćwiczenie, którego nazwa dokładnie pasuje do wpisanego tekstu, jest na górze listy.',
    ],
  },
  {
    version: '0.9.8',
    date: '2026-11-25',
    items: [
      'Polskie nazwy dla kolejnych 525 ćwiczeń — m.in. Wypychanie nóg na suwnicy, Face pull, Deska, Martwy ciąg sumo.',
      'Wskazówki trenera (na karcie ćwiczenia) dla ponad 400 kolejnych ćwiczeń: ustawienie, zakres ruchu, najczęstsze błędy.',
      'Superserie: przerwa jest jedna — po całej rundzie. W planie ustawiasz ją przy ostatnim ćwiczeniu superserii.',
      'Przycisk generatora rozgrzewki nazywa się teraz „Dobierz rozgrzewkę”, żeby nie mylił się z polem „Rozgrzewka”.',
      'Teksty w aplikacji są neutralne — bez form tylko męskich.',
    ],
  },
  {
    version: '0.9.7',
    date: '2026-11-25',
    items: [
      'Porządki: większe przyciski w treningu, w planie („Połącz z następnym”) i w Ustawieniach — łatwiej trafić palcem.',
      'Serie na czas i dystans (np. deska) liczą się w kalendarzu aktywności i w seriach na mięsień w tygodniu.',
      '„Co nowego” otwiera się od początku listy, a nie przewinięte na dół.',
      'Ćwiczenia na czas i dystans: pole „Czas” (i „Dystans”) jest teraz nad opcjonalnym ciężarem.',
      'Drobne poprawki wyglądu w superseriach i w formularzu nowego ćwiczenia.',
      'Kopia zapasowa zapamiętuje też motyw kolorów.',
    ],
  },
  {
    version: '0.9.6',
    date: '2026-11-25',
    items: [
      'Wyszukiwarka zna siłowniany slang: „allahy”, „francuz”, „OHP”, „spiętki”, „wiosło”, „narciarz”, „żuraw” i wiele innych. Pod nazwą widać, która nazwa pasuje.',
      'Własne nazwy: na karcie ćwiczenia w „Inne nazwy” dopiszesz, jak mówicie na nie na Twojej siłowni — wyszukiwarka też je znajdzie (są w kopii zapasowej).',
      'Nie ma ćwiczenia? „Utwórz własne ćwiczenie” na górze wyników — także w trakcie treningu. Nazwa wpisze się z wyszukiwania, a nowe ćwiczenie od razu się doda.',
      'W treningu edycja serii otwiera się zaraz pod serią, którą dotkniesz, a nie na dole listy.',
      'Koniec przerwy przy wygaszonym ekranie: po powrocie do aplikacji zagra dźwięk i zobaczysz, ile minęło (np. „Przerwa skończyła się 0:45 temu”). Telefon usypia aplikację po wygaszeniu ekranu, więc najlepiej nie wyłączaj go na treningu.',
      'Android: nowa opcja „Graj w tle (eksperymentalne)” w Ustawieniach › Koniec przerwy — dźwięk zagra też przy wygaszonym ekranie. Zużywa więcej baterii i może zatrzymać muzykę z innych aplikacji.',
    ],
  },
  {
    version: '0.9.5',
    date: '2026-11-25',
    items: [
      'Nowa nazwa: Banana Gym i nowa ikona — banan wyciskający sztangę na ławce.',
      'Motywy kolorów (Ustawienia › Wygląd): domyślnie bananowy żółty, do wyboru też pomarańczowy, niebieski, fioletowy i różowy. Wybór działa tylko na tym telefonie.',
      'iPhone: zainstalowana aplikacja zachowuje starą nazwę i ikonę, dopóki nie usuniesz jej z ekranu i nie dodasz ponownie. Uwaga: usunięcie aplikacji kasuje jej dane! Najpierw zrób kopię (Ustawienia › Kopia zapasowa), potem usuń ikonę, dodaj aplikację ponownie z Safari i wczytaj kopię.',
    ],
  },
  {
    version: '0.9.4',
    date: '2026-11-25',
    items: [
      'W „Co nowego” strzałkami (albo przesunięciem palcem) obejrzysz też, co dodaliśmy w poprzednich wersjach.',
    ],
  },
  {
    version: '0.9.3',
    date: '2026-11-25',
    items: [
      'Barki podzielone na przód, bok i tył: w filtrze „Mięśnie”, przy zamianie ćwiczenia (najpierw ta sama część barku), w seriach na mięsień (rozwiń „Barki”) i na sylwetce.',
      'Przy własnym ćwiczeniu na barki możesz zaznaczyć, którą część ćwiczy.',
    ],
  },
  {
    version: '0.9.2',
    date: '2026-11-25',
    items: [
      'Superserie i obwody: połącz 2–3 ćwiczenia w planie albo w trakcie treningu — robisz po jednej serii z każdego, a przerwa jest dopiero po rundzie.',
      'Ćwiczenia na czas i dystans: deska i inne utrzymania ze stoperem, spacer farmera w metrach, bieżnia i rower z czasem i kilometrami. Rodzaj ćwiczenia zmienisz na jego karcie.',
      'Przycisk „Rozgrzewka” przy ćwiczeniu proponuje lżejsze serie przed właściwym ciężarem (np. sam gryf, potem ok. 40%, 60% i 80%).',
      'Gotowe plany do wyboru (Plany › „Dodaj z szablonu”): FBW dla początkujących — wersje dla kobiet i mężczyzn — oraz plan 4-dniowy dla średnio zaawansowanych, z opisem, dla kogo są i jak z nimi robić postępy.',
      'Długie okienka (np. „Co nowego”) mają teraz stały nagłówek i wygodny odstęp przy przewijaniu.',
    ],
  },
  {
    version: '0.9.1',
    date: '2026-11-24',
    items: [
      'Podpowiedź dla każdej serii osobno: każda seria ma swój cel i krótkie wyjaśnienie, np. „Ostatnio 9 powtórzeń — dorzuć 1”. Przycisk „?” tłumaczy, jak to działa.',
      'Nowe ustawienie „Jak ciężko trenujesz?” — jeśli oceniasz trudność serii, podpowiedź bierze to pod uwagę.',
      'Gdy przez 3 treningi nic nie rośnie, aplikacja zaproponuje zejście o ok. 10% na ten trening.',
      'Kolejność ćwiczeń zmienisz w trakcie treningu: przeciągnij na liście albo „Przesuń wyżej/niżej” w opcjach. Po treningu możesz zapisać nową kolejność w planie.',
      'Nowe dźwięki końca przerwy (dzwonek, gong, dwa tony…) z przyciskiem „Posłuchaj” i osobnym włącznikiem odliczania 3-2-1.',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-11-24',
    items: [
      'Plany treningowe z dniami i ćwiczeniami — możesz je wysłać znajomemu linkiem albo kodem QR.',
      'Trening na żywo: ciężar i powtórzenia wpisane z ostatniego razu, podpowiedź, kiedy dołożyć ciężar, i licznik przerwy z dźwiękiem.',
      'Ponad 4700 ćwiczeń ze zdjęciami lub opisem, polskimi nazwami i radami. Przy dodawaniu ćwiczenia do planu lub treningu działają teraz te same filtry „Mięśnie” i „Sprzęt” co w zakładce Ćwiczenia.',
      'Zamiana ćwiczenia w trakcie treningu pokazuje najpierw ćwiczenia na ten sam mięsień (np. „Podobne (barki)”), a dopiero potem pozostałe — wyszukiwarka dalej znajduje wszystko.',
      'W trakcie treningu pod „Opis” zobaczysz zdjęcia, rady i instrukcję ćwiczenia, a w „Statystykach” także swoje rekordy.',
      'Czytelna historia: każdy trening, każda seria, rozgrzewki, ocena trudności (RPE) i puchar przy rekordzie.',
      'Statystyki: cel treningów w tygodniu, seria tygodni z rzędu, serie na mięsień, rekordy i odznaki, kalendarz całego roku.',
      'Pomiary ciała (waga, obwody) z wykresami.',
      'Import historii z pliku CSV, kopia zapasowa do pliku i odtworzenie planu z ostatnich treningów.',
      'Instrukcja instalacji na telefonie (iPhone, Android, komputer) na ekranie Start przy pierwszym otwarciu strony w przeglądarce; potem w Ustawieniach › „Jak zainstalować na telefonie”.',
      'Wszystko zostaje w Twoim telefonie i działa bez internetu.',
    ],
  },
];
