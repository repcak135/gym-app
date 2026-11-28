import { db } from './db';
import { canonicalExerciseId, remapMergedExercises } from './exercises';
import { DEFAULT_SETTINGS, getSettings, migrateSound, updateSettings } from './settings';
import { APP_VERSION } from '../version';
import { getTheme, isThemeId, setTheme, type ThemeId } from '../theme/themes';
import type {
  AppSettings, BodyEntry, Exercise, ExerciseAlias, ExerciseNote, Measure, Plan, Workout, WorkoutSet,
} from './types';

/** Bump when the file layout changes; add the upgrade step to `migrate`. */
export const BACKUP_FORMAT_VERSION = 1;
export { APP_VERSION };

const DAY = 24 * 60 * 60 * 1000;
export const BACKUP_REMIND_AFTER_MS = 14 * DAY;
export const BACKUP_SNOOZE_MS = 3 * DAY;

export interface ExerciseOverride {
  id: string;
  weightStep?: number;
  barWeight?: number;
  measureOverride?: Measure;
  userNames?: string[];
}

/** Settings that travel with the data (device-only fields stay on the device). */
export type BackupSettings = Partial<Omit<AppSettings, 'key' | 'exerciseDbVersion' | 'lastBackupAt' | 'backupReminderSnoozedUntil' | 'lastSeenVersion' | 'restPush' | 'pushId' | 'pushPromptDone' | 'errorReports' | RankKey>>;

const RANK_KEYS = ['rankToken', 'rankNick', 'rankSex', 'rankShareWorkouts', 'rankShareBench', 'cloudKey', 'cloudOn', 'cloudLastAt', 'cloudShareStats', 'cloudFingerprint'] as const;
type RankKey = (typeof RANK_KEYS)[number];

export interface BackupData {
  plans: Plan[];
  workouts: Workout[];
  sets: WorkoutSet[];
  notes: ExerciseNote[];
  aliases: ExerciseAlias[];
  body: BodyEntry[];
  customExercises: Exercise[];
  exerciseOverrides: ExerciseOverride[];
  settings: BackupSettings;
}

export interface BackupFile {
  app: 'gym-app';
  formatVersion: number;
  appVersion: string;
  exportedAt: number;
  /** Colour theme (kept in localStorage, not in Dexie). Missing in files from before 0.9.7. */
  theme?: ThemeId;
  data: BackupData;
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

const DEVICE_ONLY = new Set(['key', 'exerciseDbVersion', 'lastBackupAt', 'backupReminderSnoozedUntil', 'lastSeenVersion', 'restPush', 'pushId', 'pushPromptDone', 'errorReports', ...RANK_KEYS]);

export async function createBackup(now = Date.now()): Promise<BackupFile> {
  return db.transaction('r', [db.plans, db.workouts, db.sets, db.notes, db.aliases, db.body, db.exercises, db.settings], async () => {
    const exercises = await db.exercises
      .filter((e) => e.custom || e.weightStep !== undefined || e.barWeight !== undefined || e.measureOverride !== undefined || !!e.userNames?.length)
      .toArray();
    const settings = await getSettings();
    const kept: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(settings)) if (!DEVICE_ONLY.has(k) && v !== undefined) kept[k] = v;
    return {
      app: 'gym-app',
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: APP_VERSION,
      exportedAt: now,
      theme: getTheme(),
      data: {
        plans: await db.plans.toArray(),
        workouts: await db.workouts.toArray(),
        sets: await db.sets.toArray(),
        notes: await db.notes.toArray(),
        aliases: await db.aliases.toArray(),
        body: await db.body.toArray(),
        customExercises: exercises.filter((e) => e.custom),
        exerciseOverrides: exercises
          .filter((e) => !e.custom)
          .map((e) => ({
            id: e.id,
            ...(e.weightStep !== undefined && { weightStep: e.weightStep }),
            ...(e.barWeight !== undefined && { barWeight: e.barWeight }),
            ...(e.measureOverride !== undefined && { measureOverride: e.measureOverride }),
            ...(e.userNames?.length && { userNames: e.userNames }),
          })),
        settings: kept as BackupSettings,
      },
    };
  });
}

export function backupFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `gym-kopia-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

// ---------- validation ----------

type Row = Record<string, unknown>;
const isObj = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string' && v.length > 0;
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

const TABLE_CHECKS: Record<Exclude<keyof BackupData, 'settings'>, [label: string, ok: (r: Row) => boolean]> = {
  plans: ['plany', (r) => str(r.id) && typeof r.name === 'string' && Array.isArray(r.days)],
  workouts: ['treningi', (r) => str(r.id) && num(r.startedAt)],
  sets: ['serie', (r) => str(r.id) && str(r.workoutId) && str(r.exerciseId) && num(r.weight) && num(r.reps)],
  notes: ['notatki', (r) => str(r.exerciseId) && typeof r.text === 'string'],
  aliases: ['dopasowania ćwiczeń', (r) => str(r.sourceName) && str(r.exerciseId)],
  body: ['pomiary', (r) => str(r.id) && str(r.date)],
  customExercises: ['własne ćwiczenia', (r) => str(r.id) && typeof r.name === 'string'],
  exerciseOverrides: ['ustawienia ćwiczeń', (r) => str(r.id)],
};

/** Upgrades an older file to the current layout. Tables added later are empty in older files. */
function migrate(raw: Row): Row {
  const data: Row = isObj(raw.data) ? { ...raw.data } : {};
  for (const table of Object.keys(TABLE_CHECKS)) if (data[table] === undefined) data[table] = [];
  if (data.settings === undefined) data.settings = {};
  // Future: if (version < 2) { ...upgrade v1 → v2... }
  return { ...raw, data, formatVersion: BACKUP_FORMAT_VERSION };
}

const SOUND_PRESETS: string[] = ['bell', 'gong', 'twoTones', 'beeps', 'vibrate', 'silent'];

function cleanSettings(raw: unknown): BackupSettings {
  if (!isObj(raw)) throw new BackupError('Plik jest uszkodzony (ustawienia).');
  const out: Record<string, unknown> = {};
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    if (DEVICE_ONLY.has(k)) continue;
    const v = raw[k];
    if (Array.isArray(def)) {
      if (Array.isArray(v) && v.every((x) => num(x) && x > 0)) out[k] = v;
    } else if (typeof v === typeof def && (typeof v !== 'number' || num(v))) out[k] = v;
  }
  if (!SOUND_PRESETS.includes(out.restSoundPreset as string)) delete out.restSoundPreset;
  if (str(raw.activePlanId)) out.activePlanId = raw.activePlanId;
  return out as BackupSettings;
}

export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('To nie jest plik kopii (nie da się go odczytać).');
  }
  if (!isObj(raw) || raw.app !== 'gym-app' || !num(raw.formatVersion)) {
    throw new BackupError('To nie jest plik kopii tej aplikacji.');
  }
  if ((raw.formatVersion as number) > BACKUP_FORMAT_VERSION) {
    throw new BackupError('Ta kopia pochodzi z nowszej wersji aplikacji. Zaktualizuj aplikację (zamknij ją i otwórz ponownie) i spróbuj jeszcze raz.');
  }
  if (!num(raw.exportedAt)) throw new BackupError('Plik kopii jest uszkodzony (brak daty).');
  const file = migrate(raw);
  const data = file.data as Row;
  for (const [table, [label, ok]] of Object.entries(TABLE_CHECKS)) {
    const rows = data[table];
    if (!Array.isArray(rows) || !rows.every((r) => isObj(r) && ok(r))) {
      throw new BackupError(`Plik kopii jest uszkodzony (${label}).`);
    }
  }
  data.settings = cleanSettings(data.settings);
  return {
    app: 'gym-app',
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : '?',
    exportedAt: raw.exportedAt as number,
    ...(isThemeId(raw.theme) && { theme: raw.theme }),
    data: data as unknown as BackupData,
  };
}

export interface BackupSummary {
  exportedAt: number;
  appVersion: string;
  plans: number;
  workouts: number;
  sets: number;
  measurements: number;
  customExercises: number;
}

export function summarizeBackup(f: BackupFile): BackupSummary {
  return {
    exportedAt: f.exportedAt,
    appVersion: f.appVersion,
    plans: f.data.plans.length,
    workouts: f.data.workouts.length,
    sets: f.data.sets.length,
    measurements: f.data.body.length,
    customExercises: f.data.customExercises.length,
  };
}

/** Counts of what is on the device now (shown before replacing it). */
export async function currentSummary(): Promise<Omit<BackupSummary, 'exportedAt' | 'appVersion'>> {
  return {
    plans: await db.plans.count(),
    workouts: await db.workouts.count(),
    sets: await db.sets.count(),
    measurements: await db.body.count(),
    customExercises: await db.exercises.filter((e) => e.custom).count(),
  };
}

/**
 * Replaces all user data with the backup. One transaction: if anything fails,
 * nothing changes. The built-in exercise catalogue stays; its per-exercise
 * settings are replaced by the ones from the backup.
 */
export async function restoreBackup(f: BackupFile): Promise<void> {
  const d = f.data;
  await db.transaction('rw', [db.plans, db.workouts, db.sets, db.notes, db.aliases, db.body, db.exercises, db.settings], async () => {
    const device = await db.settings.get('app');
    await Promise.all([db.plans.clear(), db.workouts.clear(), db.sets.clear(), db.notes.clear(), db.aliases.clear(), db.body.clear()]);
    await db.exercises.filter((e) => e.custom).delete();
    await db.exercises
      .filter((e) => e.weightStep !== undefined || e.barWeight !== undefined || e.measureOverride !== undefined || e.userNames !== undefined)
      .modify((e) => { delete e.weightStep; delete e.barWeight; delete e.measureOverride; delete e.userNames; });

    await db.plans.bulkAdd(d.plans);
    await db.workouts.bulkAdd(d.workouts);
    await db.sets.bulkAdd(d.sets);
    await db.notes.bulkAdd(d.notes);
    await db.aliases.bulkAdd(d.aliases);
    await db.body.bulkAdd(d.body);
    await db.exercises.bulkPut(d.customExercises.map((e) => ({ ...e, custom: true })));
    for (const o of d.exerciseOverrides) {
      const patch: Partial<Exercise> = {};
      if (o.weightStep !== undefined) patch.weightStep = o.weightStep;
      if (o.barWeight !== undefined) patch.barWeight = o.barWeight;
      if (o.measureOverride !== undefined) patch.measureOverride = o.measureOverride;
      if (Array.isArray(o.userNames) && o.userNames.length) patch.userNames = o.userNames.filter((n) => typeof n === 'string');
      // A backup from before a duplicate merge: the settings go to the exercise that was kept.
      await db.exercises.update(canonicalExerciseId(o.id), patch);
    }
    const settings: AppSettings = migrateSound({
      ...DEFAULT_SETTINGS,
      ...d.settings,
      key: 'app',
      exerciseDbVersion: device?.exerciseDbVersion,
      lastSeenVersion: device?.lastSeenVersion,
      restPush: device?.restPush,
      pushId: device?.pushId,
      pushPromptDone: device?.pushPromptDone,
      errorReports: device?.errorReports,
      lastBackupAt: f.exportedAt,
    }, d.settings);
    if (settings.exerciseDbVersion === undefined) delete settings.exerciseDbVersion;
    if (settings.lastSeenVersion === undefined) delete settings.lastSeenVersion;
    if (settings.restPush === undefined) delete settings.restPush;
    if (settings.pushId === undefined) delete settings.pushId;
    if (settings.pushPromptDone === undefined) delete settings.pushPromptDone;
    if (settings.errorReports === undefined) delete settings.errorReports;
    // The ranking account belongs to this phone: keep it as it is.
    for (const k of RANK_KEYS) {
      if (device?.[k] === undefined) delete settings[k];
      else (settings as unknown as Record<string, unknown>)[k] = device[k];
    }
    await db.settings.put(settings);
    // An older backup can still point at merged duplicates: same transaction, so all or nothing.
    await remapMergedExercises();
  });
  // Only after the data is safely in: a failed restore must not change the look either.
  if (f.theme) setTheme(f.theme);
}

// ---------- reminder ----------

export async function markBackupDone(now = Date.now()): Promise<void> {
  await updateSettings({ lastBackupAt: now, backupReminderSnoozedUntil: undefined });
}

export async function snoozeBackupReminder(now = Date.now()): Promise<void> {
  await updateSettings({ backupReminderSnoozedUntil: now + BACKUP_SNOOZE_MS });
}

export function backupReminderDue(
  s: Pick<AppSettings, 'lastBackupAt' | 'backupReminderSnoozedUntil' | 'cloudOn' | 'cloudLastAt'>,
  hasWorkouts: boolean,
  now = Date.now(),
): boolean {
  if (!hasWorkouts) return false;
  // A recent cloud backup is a backup too.
  if (s.cloudOn && s.cloudLastAt !== undefined && now - s.cloudLastAt <= BACKUP_REMIND_AFTER_MS) return false;
  if (s.backupReminderSnoozedUntil !== undefined && now < s.backupReminderSnoozedUntil) return false;
  return s.lastBackupAt === undefined || now - s.lastBackupAt > BACKUP_REMIND_AFTER_MS;
}
