import Dexie, { type Table } from 'dexie';
import type { Exercise, ExerciseNote, Plan, Workout, WorkoutSet, AppSettings, ExerciseAlias } from './types';

export class GymDatabase extends Dexie {
  exercises!: Table<Exercise, string>;
  notes!: Table<ExerciseNote, string>;
  plans!: Table<Plan, string>;
  workouts!: Table<Workout, string>;
  sets!: Table<WorkoutSet, string>;
  settings!: Table<AppSettings, string>;
  aliases!: Table<ExerciseAlias, string>;

  constructor() {
    super('gym-app');
    this.version(1).stores({
      exercises: 'id, name',
      notes: 'exerciseId',
      plans: 'id',
      workouts: 'id, startedAt, importKey',
      sets: 'id, workoutId, exerciseId, [exerciseId+workoutId]',
      settings: 'key',
      aliases: 'sourceName',
    });
  }
}

export const db = new GymDatabase();
