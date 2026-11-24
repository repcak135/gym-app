export type Id = string; // crypto.randomUUID()

export interface Exercise {
  id: Id;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string | null;
  category: string;
  level?: string;
  instructions: string[];
  images: string[];
  custom: boolean;
  weightStep?: number;
  barWeight?: number;
  /** Polish name (openGym catalogue); shown under the English name and searchable. */
  namePl?: string;
  /** Other names of the same exercise (old apps, gyms); the import matches them exactly. */
  aka?: string[];
  /** Names of a near-identical exercise: proposed and pre-selected on the import matching screen. */
  similar?: string[];
  /** Names that might mean this exercise: proposed but not pre-selected. */
  maybe?: string[];
}

export interface ExerciseNote {
  exerciseId: Id;
  text: string;
  updatedAt: number;
}

export interface PlanItem {
  exerciseId: Id;
  sets: number;
  warmupSets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
}

export interface PlanDay {
  id: Id;
  name: string;
  items: PlanItem[];
}

export interface Plan {
  id: Id;
  name: string;
  startedAt: string; // YYYY-MM-DD
  days: PlanDay[];
}

/** One exercise of a live/finished workout, with the targets it started with. */
export interface WorkoutExercise {
  exerciseId: Id;
  warmupSets: number;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
}

export interface Workout {
  id: Id;
  name: string;
  startedAt: number;
  endedAt?: number;
  planId?: Id;
  dayId?: Id;
  source: 'app' | 'import';
  importKey?: string;
  /** Live-workout state (absent on imported workouts). Unindexed, no schema change. */
  exercises?: WorkoutExercise[];
  currentIndex?: number;
  restEndsAt?: number;
  restTotalSec?: number;
}

export interface WorkoutSet {
  id: Id;
  workoutId: Id;
  exerciseId: Id;
  exerciseOrder: number;
  setOrder: number;
  weight: number;
  reps: number;
  warmup: boolean;
  completedAt?: number;
  /** Reps in reserve, 0–5 (5 = 5+); optional, advanced option. Unindexed, no schema change. */
  rir?: number;
}

export type MeasureKey =
  | 'neck' | 'shoulders' | 'chest' | 'waist' | 'hips'
  | 'bicepsL' | 'bicepsR' | 'forearmL' | 'forearmR'
  | 'thighL' | 'thighR' | 'calfL' | 'calfR';

export type BodyMetric = 'weight' | 'bodyFat' | MeasureKey;

export interface BodyEntry {
  id: Id;
  date: string; // YYYY-MM-DD
  weightKg?: number;
  measurements: Partial<Record<MeasureKey, number>>;
  bodyFatPct?: number;
}

export interface ExerciseAlias {
  sourceName: string;
  exerciseId: Id;
}

/** What the live workout does after the last set of an exercise is completed. */
export type AfterExerciseDone = 'next' | 'list' | 'stay';

export interface AppSettings {
  key: 'app';
  activePlanId?: Id;
  barWeight: number;
  plates: number[];
  defaultWeightStep: number;
  /** Defaults for exercises newly added to a plan day (owner's request, stage 3). */
  defaultRestSec: number;
  defaultSets: number;
  defaultWarmupSets: number;
  defaultRepsMin: number;
  defaultRepsMax: number;
  /** End of rest: sound (beats the iPhone silent switch) and vibration (Android). */
  restSound: boolean;
  restVibration: boolean;
  /** Advanced: show the RIR picker on each set. */
  showRir: boolean;
  afterExerciseDone: AfterExerciseDone;
  lastBackupAt?: number;
  /** Backup reminder on Start hidden until this time ("Później"). */
  backupReminderSnoozedUntil?: number;
  exerciseDbVersion?: number;
}
