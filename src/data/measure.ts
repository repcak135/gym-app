import type { Exercise, Measure } from './types';

export function measureOf(ex: Pick<Exercise, 'measure' | 'measureOverride'> | undefined): Measure {
  return ex?.measureOverride ?? ex?.measure ?? 'reps';
}

/** 45 → "0:45", 90 → "1:30", 3725 → "1:02:05". */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  if (h === 0) return `${m}:${ss}`;
  return `${h}:${String(m).padStart(2, '0')}:${ss}`;
}

/** distance: "40 m"; timeDistance: "2,5 km" from 1000 m, "800 m" below. */
export function formatDistance(m: number, measure: Measure): string {
  if (measure === 'timeDistance' && m >= 1000) {
    return `${String(Math.round(m / 100) / 10).replace('.', ',')} km`;
  }
  return `${String(Math.round(m * 10) / 10).replace('.', ',')} m`;
}

/** "45" → 45, "1:30" → 90, "1:02:05" → 3725; null when it is not a duration. */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
  const parts = t.split(':').map(Number);
  if (parts.slice(1).some((p) => p > 59)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export const MEASURE_OPTIONS: { value: Measure; label: string }[] = [
  { value: 'reps', label: 'Powtórzenia' },
  { value: 'time', label: 'Czas (np. deska)' },
  { value: 'distance', label: 'Dystans (np. spacer farmera)' },
  { value: 'timeDistance', label: 'Czas i dystans (cardio)' },
];
