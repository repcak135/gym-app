/** Set difficulty as an RPE-style list. Stored data stays RIR (0..5, 5 = 5 or more). */
export interface DifficultyLevel {
  /** RPE as shown: "10", "5–6", "1–4". */
  rpe: string;
  rir: number;
  label: string;
  description: string;
  /** Spoken form of the reserve, e.g. "2 powtórzenia w zapasie". */
  spoken: string;
  color: string;
}

export const DIFFICULTY_LEVELS: DifficultyLevel[] = [
  { rpe: '10', rir: 0, label: 'Maksymalny wysiłek', description: 'Nie zrobiłbyś już ani jednego powtórzenia', spoken: 'brak powtórzeń w zapasie', color: '#e5484d' },
  { rpe: '9', rir: 1, label: 'Bardzo ciężko', description: 'Dałbyś radę jeszcze 1 powtórzenie', spoken: '1 powtórzenie w zapasie', color: 'var(--accent)' },
  { rpe: '8', rir: 2, label: 'Ciężko', description: 'Jeszcze 2 powtórzenia w zapasie', spoken: '2 powtórzenia w zapasie', color: '#f5d90a' },
  { rpe: '7', rir: 3, label: 'Dość ciężko', description: 'Jeszcze 3 powtórzenia w zapasie', spoken: '3 powtórzenia w zapasie', color: 'var(--success)' },
  { rpe: '5–6', rir: 4, label: 'Średnio', description: 'Jeszcze 4–6 powtórzeń w zapasie', spoken: '4–6 powtórzeń w zapasie', color: '#3e8ef7' },
  { rpe: '1–4', rir: 5, label: 'Lekko', description: 'Spokojny wysiłek, dużo w zapasie', spoken: 'dużo w zapasie', color: '#a35cf0' },
];

export function levelForRir(rir: number): DifficultyLevel {
  const r = Math.min(5, Math.max(0, Math.round(rir)));
  return DIFFICULTY_LEVELS.find((l) => l.rir === r) as DifficultyLevel;
}

/** "RPE 8" for rir 2; "RPE 5–6" for rir 4; "RPE 1–4" for rir 5+. */
export function rirToRpeLabel(rir: number): string {
  return `RPE ${levelForRir(rir).rpe}`;
}

/** Stored RIR for a row's RPE text ("8" -> 2, "5–6" -> 4). */
export function rpeToRir(rpe: string): number | undefined {
  return DIFFICULTY_LEVELS.find((l) => l.rpe === rpe)?.rir;
}
