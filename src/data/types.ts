import type { EffortTarget } from './setTargets';
import type { Delts } from './deltHeads';

export type Id = string; // crypto.randomUUID()

/** What a set of an exercise records: reps (default), a held time, a distance, or both (cardio). */
export type Measure = 'reps' | 'time' | 'distance' | 'timeDistance';

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
  /** Built-in default from exercise-measure.json, or the choice on a custom exercise; undefined = reps. */
  measure?: Measure;
  /** The user's choice on a built-in exercise; kept on reseed. */
  measureOverride?: Measure;
  /** Original English name of a built-in exercise whose `name` is Polish; shown under it and searchable. */
  nameEn?: string;
  /** Other names of the same exercise (old apps, gyms); the import matches them exactly. */
  aka?: string[];
  /** The user's own other names for this exercise (searchable); kept on reseed and in the backup. */
  userNames?: string[];
  /** Names of a near-identical exercise: proposed and pre-selected on the import matching screen. */
  similar?: string[];
  /** Names that might mean this exercise: proposed but not pre-selected. */
  maybe?: string[];
  /** Deltoid heads (przód / bok / tył) of a built-in shoulder exercise; absent = plain "Barki". */
  delts?: Delts;
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
  /** Targets for time / distance exercises (reps fields stay as they are). */
  targetSec?: number;
  targetM?: number;
  /** Consecutive items with an equal group id form one superset / circuit (2-3 items). */
  group?: string;
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
  targetSec?: number;
  targetM?: number;
  group?: string;
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
  /** When the last rest ran out (not skipped): a "Koniec przerwy" bar stays until the next set or a dismiss. */
  restEndedAt?: number;
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
  /** Time exercises (plank, cardio): seconds held / done. Unindexed, no schema change. */
  durationSec?: number;
  /** Distance exercises (farmer's walk, cardio): metres. */
  distanceM?: number;
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

export type RestSoundPreset = 'bell' | 'gong' | 'twoTones' | 'beeps' | 'vibrate' | 'silent';

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
  /** Legacy on/off sound (old rows and backups); superseded by restSoundPreset. */
  restSound: boolean;
  /** End-of-rest sound (beats the iPhone silent switch). */
  restSoundPreset: RestSoundPreset;
  /** Soft 3-2-1 ticks before the end of the rest (only with a sound preset). */
  restTicks: boolean;
  /** End of rest: vibration (Android). */
  restVibration: boolean;
  /** Android, experimental: play the rest as one audio file so the end sound plays with the screen off. */
  restBackgroundAudio?: boolean;
  /** iPhone: end-of-rest sound also with the ring/silent switch on — this pauses music from other apps. */
  restSoundBreaksSilent?: boolean;
  /** Advanced: show the RIR picker on each set. */
  showRir: boolean;
  /** With showRir on: open the difficulty sheet right after "Zalicz serię". */
  askDifficultyAfterSet: boolean;
  afterExerciseDone: AfterExerciseDone;
  /** How close to failure the owner trains; sets the progression targets (default 'close'). */
  effortTarget: EffortTarget;
  /** Finished workouts per week (Mon–Sun) that make the week count for the streak; 1–7. */
  weeklyGoal: number;
  lastBackupAt?: number;
  /** Backup reminder on Start hidden until this time ("Później"). */
  backupReminderSnoozedUntil?: number;
  exerciseDbVersion?: number;
  /** Device-only: last app version whose "Co nowego" the user has seen (not in backups). */
  lastSeenVersion?: string;
  /** Device-only: "Powiadomienie przy zablokowanym ekranie" (rest-end push) is on. */
  restPush?: boolean;
  /** Device-only: random id of this phone on the push server. */
  pushId?: string;
  /** Device-only: the "Powiadomienie o końcu przerwy?" question was answered (asked once). */
  pushPromptDone?: boolean;
  /** Device-only: "Wysyłaj raporty błędów" (undefined = on). */
  errorReports?: boolean;
  /** Device-only ranking account (never in backups: the token would hand over the account). */
  rankToken?: string;
  rankNick?: string;
  /** For DOTS points; asked at join and login, kept on the phone only. */
  rankSex?: 'm' | 'f';
  rankShareWorkouts?: boolean;
  rankShareBench?: boolean;
}
