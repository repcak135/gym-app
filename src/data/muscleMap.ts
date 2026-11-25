// Muscle vocabulary of all exercise sources (free-exercise-db words; x- extras and openGym
// are mapped onto the same words) → chart groups and body silhouette parts.
import type { DeltHead } from './deltHeads';

export type MuscleGroup =
  | 'klatka'
  | 'plecy'
  | 'barki'
  | 'nogi'
  | 'biceps'
  | 'triceps'
  | 'brzuch'
  | 'lydki'
  | 'posladki'
  | 'przedramiona';

// Colours: validated categorical palette (dataviz reference dark steps + 2 slots), adjacent-pair CVD-safe on --surface.
export const MUSCLE_GROUPS: readonly { key: MuscleGroup; label: string; color: string }[] = [
  { key: 'klatka', label: 'Klatka', color: '#3987e5' },
  { key: 'plecy', label: 'Plecy', color: '#d95926' },
  { key: 'barki', label: 'Barki', color: '#199e70' },
  { key: 'nogi', label: 'Nogi', color: '#c98500' },
  { key: 'biceps', label: 'Biceps', color: '#d55181' },
  { key: 'triceps', label: 'Triceps', color: '#0ca30c' },
  { key: 'brzuch', label: 'Brzuch', color: '#9085e9' },
  { key: 'lydki', label: 'Łydki', color: '#e66767' },
  { key: 'posladki', label: 'Pośladki', color: '#2f9fb8' },
  { key: 'przedramiona', label: 'Przedramiona', color: '#b5651d' },
];

export type BodyPart =
  | 'chest'
  | 'abs'
  | 'obliques'
  | 'biceps'
  | 'triceps'
  | 'forearm'
  | 'front-deltoids'
  | 'back-deltoids'
  | 'trapezius'
  | 'upper-back'
  | 'lower-back'
  | 'quadriceps'
  | 'hamstring'
  | 'adductor'
  | 'abductors'
  | 'calves'
  | 'gluteal'
  | 'neck';

export const BODY_PART_LABEL: Record<BodyPart, string> = {
  chest: 'Klatka',
  abs: 'Brzuch',
  obliques: 'Skośne brzucha',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearm: 'Przedramiona',
  'front-deltoids': 'Barki (przód)',
  'back-deltoids': 'Barki (tył)',
  trapezius: 'Kaptury',
  'upper-back': 'Plecy (najszersze, środek)',
  'lower-back': 'Dolny odcinek pleców',
  quadriceps: 'Czworogłowe ud',
  hamstring: 'Dwugłowe ud',
  adductor: 'Przywodziciele',
  abductors: 'Odwodziciele',
  calves: 'Łydki',
  gluteal: 'Pośladki',
  neck: 'Szyja',
};

const MAP: Record<string, [MuscleGroup, BodyPart[]]> = {
  chest: ['klatka', ['chest']],
  lats: ['plecy', ['upper-back']],
  'middle back': ['plecy', ['upper-back']],
  'lower back': ['plecy', ['lower-back']],
  traps: ['plecy', ['trapezius']],
  neck: ['plecy', ['neck']],
  shoulders: ['barki', ['front-deltoids', 'back-deltoids']],
  quadriceps: ['nogi', ['quadriceps']],
  hamstrings: ['nogi', ['hamstring']],
  adductors: ['nogi', ['adductor']],
  abductors: ['nogi', ['abductors']],
  biceps: ['biceps', ['biceps']],
  triceps: ['triceps', ['triceps']],
  abdominals: ['brzuch', ['abs', 'obliques']],
  calves: ['lydki', ['calves']],
  glutes: ['posladki', ['gluteal']],
  forearms: ['przedramiona', ['forearm']],
};

export const MUSCLE_TO_GROUP: Record<string, MuscleGroup> = Object.fromEntries(
  Object.entries(MAP).map(([m, [g]]) => [m, g]),
);
export const MUSCLE_TO_BODY: Record<string, BodyPart[]> = Object.fromEntries(
  Object.entries(MAP).map(([m, [, parts]]) => [m, parts]),
);

export function muscleGroup(m: string): MuscleGroup | undefined {
  return MUSCLE_TO_GROUP[m.trim().toLowerCase()];
}

export function bodyParts(m: string): BodyPart[] {
  return MUSCLE_TO_BODY[m.trim().toLowerCase()] ?? [];
}

const HEAD_PART: Record<DeltHead, BodyPart> = { front: 'front-deltoids', side: 'front-deltoids', rear: 'back-deltoids' };

/**
 * Silhouette parts of a muscle list. With known deltoid heads (of the same role) "shoulders" lights only
 * the matching deltoid parts; without heads it keeps lighting both.
 */
export function bodyPartsOf(muscles: string[], heads: DeltHead[] = []): BodyPart[] {
  const out = new Set<BodyPart>();
  for (const m of muscles) {
    if (m.trim().toLowerCase() === 'shoulders' && heads.length > 0) for (const h of heads) out.add(HEAD_PART[h]);
    else for (const p of bodyParts(m)) out.add(p);
  }
  return [...out];
}
