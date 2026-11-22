export const MUSCLES: readonly string[] = [
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
] as const;

export const MUSCLE_PL: Record<string, string> = {
  abdominals: 'Brzuch',
  abductors: 'Odwodziciele',
  adductors: 'Przywodziciele',
  biceps: 'Biceps',
  calves: 'Łydki',
  chest: 'Klatka piersiowa',
  forearms: 'Przedramiona',
  glutes: 'Pośladki',
  hamstrings: 'Dwugłowe ud',
  lats: 'Najszersze grzbietu',
  'lower back': 'Dolny odcinek pleców',
  'middle back': 'Środek pleców',
  neck: 'Szyja',
  quadriceps: 'Czworogłowe ud',
  shoulders: 'Barki',
  traps: 'Kaptury',
  triceps: 'Triceps',
};

export function muscleLabel(m: string): string {
  return MUSCLE_PL[m] ?? m;
}

export const EQUIPMENT: readonly string[] = [
  'bands',
  'barbell',
  'body only',
  'cable',
  'dumbbell',
  'e-z curl bar',
  'exercise ball',
  'foam roll',
  'kettlebells',
  'machine',
  'medicine ball',
  'other',
] as const;

export const EQUIPMENT_PL: Record<string, string> = {
  bands: 'Gumy',
  barbell: 'Sztanga',
  'body only': 'Masa ciała',
  cable: 'Wyciąg',
  dumbbell: 'Hantle',
  'e-z curl bar': 'Gryf łamany',
  'exercise ball': 'Piłka gimnastyczna',
  'foam roll': 'Wałek',
  kettlebells: 'Kettlebell',
  machine: 'Maszyna',
  'medicine ball': 'Piłka lekarska',
  other: 'Inne',
};

export function equipmentLabel(e: string | null): string {
  if (e === null) return 'Brak';
  return EQUIPMENT_PL[e] ?? e;
}

export const LEVEL_PL: Record<string, string> = {
  beginner: 'Początkujący',
  intermediate: 'Średnio zaawansowany',
  expert: 'Zaawansowany',
};
