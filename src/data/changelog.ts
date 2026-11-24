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
