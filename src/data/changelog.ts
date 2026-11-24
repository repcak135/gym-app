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
    version: '0.9.0',
    date: '2026-11-24',
    items: [
      'Plany treningowe z dniami i ćwiczeniami — możesz je wysłać znajomemu linkiem albo kodem QR.',
      'Trening na żywo: ciężar i powtórzenia wpisane z ostatniego razu, podpowiedź, kiedy dołożyć ciężar, i licznik przerwy z dźwiękiem.',
      'Ponad 4700 ćwiczeń ze zdjęciami lub opisem, polskimi nazwami i radami. Przy dodawaniu ćwiczenia do planu lub treningu działają teraz te same filtry „Mięśnie” i „Sprzęt” co w zakładce Ćwiczenia.',
      'W trakcie treningu pod „Opis” zobaczysz zdjęcia, rady i instrukcję ćwiczenia, a w „Statystykach” także swoje rekordy.',
      'Czytelna historia: każdy trening, każda seria, rozgrzewki, ocena trudności (RPE) i puchar przy rekordzie.',
      'Statystyki: cel treningów w tygodniu, seria tygodni z rzędu, serie na mięsień, rekordy i odznaki, kalendarz całego roku.',
      'Pomiary ciała (waga, obwody) z wykresami.',
      'Import historii z pliku CSV, kopia zapasowa do pliku i odtworzenie planu z ostatnich treningów.',
      'Wszystko zostaje w Twoim telefonie i działa bez internetu.',
    ],
  },
];
