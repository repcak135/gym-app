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

export interface Workout {
  id: Id;
  name: string;
  startedAt: number;
  endedAt?: number;
  planId?: Id;
  dayId?: Id;
  source: 'app' | 'import';
  importKey?: string;
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
}

export interface ExerciseAlias {
  sourceName: string;
  exerciseId: Id;
}

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
  lastBackupAt?: number;
  exerciseDbVersion?: number;
}
