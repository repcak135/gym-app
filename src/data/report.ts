import { BODY_METRICS, entryValues } from './body';
import { db } from './db';
import { workoutDurationSec } from './history';
import { epley1RM } from './progression';
import { countedSets, workingSets } from './records';
import { periodRange } from './stats';
import { isFinished } from './workouts';
import type { BodyEntry, BodyMetric, Workout, WorkoutSet } from './types';

// Report data for a period (pure, no exceljs: the UI loads reportXlsx.ts lazily).

export type ReportPeriod = 'week' | 'month' | 'year' | 'all' | 'custom';

export interface ReportRange {
  start: number;
  /** Exclusive. */
  end: number;
  /** Inclusive first day, local YYYY-MM-DD. */
  from: string;
  /** Inclusive last day, local YYYY-MM-DD. */
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

function ymd(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseYmd(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function midnight(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function addDays(t: number, days: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

export function reportRange(
  p: ReportPeriod,
  now: number,
  firstAt?: number,
  custom?: { from: string; to: string },
): ReportRange {
  if (p === 'custom') {
    if (!custom || !custom.from || !custom.to) throw new Error('Wybierz obie daty');
    if (custom.from > custom.to) throw new Error('Data początkowa jest po końcowej');
    return { start: parseYmd(custom.from), end: addDays(parseYmd(custom.to), 1), from: custom.from, to: custom.to };
  }
  if (p === 'all') {
    const start = midnight(firstAt ?? now);
    const end = addDays(now, 1);
    return { start, end, from: ymd(start), to: ymd(addDays(end, -1)) };
  }
  const r = periodRange(p, 0, now);
  return { start: r.start, end: r.end, from: ymd(r.start), to: ymd(addDays(r.end, -1)) };
}

export function reportFileName(r: { from: string; to: string }): string {
  return `raport-${r.from}_${r.to}.xlsx`;
}

export interface ReportInput {
  workouts: Workout[];
  sets: WorkoutSet[];
  exercises: Map<string, { name: string }>;
  body: BodyEntry[];
}

export async function loadReportInput(): Promise<ReportInput> {
  const [workouts, sets, exercises, body] = await Promise.all([
    db.workouts.toArray(),
    db.sets.toArray(),
    db.exercises.toArray(),
    db.body.toArray(),
  ]);
  return { workouts, sets, exercises: new Map(exercises.map((e) => [e.id, { name: e.name }] as const)), body };
}

export interface ReportData {
  from: string;
  to: string;
  summary: {
    workouts: number;
    timedWorkouts: number;
    totalSec: number;
    workingSets: number;
    volume: number;
    records: { date: number; exercise: string; kind: 'Ciężar' | 'Szacowany 1RM'; value: number; previous: number }[];
    body: { label: string; unit: string; start?: number; end?: number; change?: number }[];
  };
  workouts: {
    date: number;
    name: string;
    durationMin?: number;
    exercises: string;
    workingSets: number;
    volume: number;
  }[];
  sets: {
    date: number;
    workout: string;
    exercise: string;
    set: number;
    weight: number;
    reps: number;
    durationSec?: number;
    distanceM?: number;
    rir?: number;
    warmup: boolean;
  }[];
  progress: {
    exercise: string;
    workingSets: number;
    startWeight: number;
    endWeight: number;
    startE1rm: number;
    endE1rm: number;
  }[];
  body: { date: string; values: Partial<Record<BodyMetric, number>> }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const byOrder = (a: WorkoutSet, b: WorkoutSet) => a.exerciseOrder - b.exerciseOrder || a.setOrder - b.setOrder;

function bestOf(sets: WorkoutSet[]): { weight: number; e1rm: number } {
  let weight = 0;
  let e1rm = 0;
  for (const s of workingSets(sets)) {
    weight = Math.max(weight, s.weight);
    e1rm = Math.max(e1rm, epley1RM(s.weight, s.reps));
  }
  return { weight, e1rm };
}

export function buildReport(input: ReportInput, range: ReportRange): ReportData {
  const name = (id: string) => input.exercises.get(id)?.name ?? 'Nieznane ćwiczenie';
  const finished = input.workouts.filter(isFinished);
  const inRange = finished
    .filter((w) => w.startedAt >= range.start && w.startedAt < range.end)
    .sort((a, b) => a.startedAt - b.startedAt);

  const setsByWorkout = new Map<string, WorkoutSet[]>();
  for (const s of input.sets) {
    if (s.completedAt === undefined) continue;
    const list = setsByWorkout.get(s.workoutId) ?? [];
    list.push(s);
    setsByWorkout.set(s.workoutId, list);
  }
  for (const list of setsByWorkout.values()) list.sort(byOrder);

  let timed = 0;
  let totalSec = 0;
  let workingCount = 0;
  let volume = 0;
  const workoutRows: ReportData['workouts'] = [];
  const setRows: ReportData['sets'] = [];
  // per exercise: per workout best values, in chronological order
  const perExercise = new Map<string, { at: number; weight: number; e1rm: number }[]>();
  const exerciseSetCount = new Map<string, number>();

  for (const w of inRange) {
    const sets = setsByWorkout.get(w.id) ?? [];
    const work = workingSets(sets);
    const wVol = work.reduce((sum, s) => sum + s.weight * s.reps, 0);
    const dur = workoutDurationSec(w);
    if (dur !== undefined) {
      timed++;
      totalSec += dur;
    }
    workingCount += countedSets(sets).length;
    volume += wVol;

    const ids: string[] = [];
    const counters = new Map<string, number>();
    for (const s of sets) {
      if (!counters.has(s.exerciseId)) ids.push(s.exerciseId);
      const n = (counters.get(s.exerciseId) ?? 0) + 1;
      counters.set(s.exerciseId, n);
      const row: ReportData['sets'][number] = {
        date: w.startedAt,
        workout: w.name,
        exercise: name(s.exerciseId),
        set: n,
        weight: s.weight,
        reps: s.reps,
        warmup: s.warmup,
      };
      if (s.rir !== undefined) row.rir = s.rir;
      if ((s.durationSec ?? 0) > 0) row.durationSec = s.durationSec;
      if ((s.distanceM ?? 0) > 0) row.distanceM = s.distanceM;
      setRows.push(row);
    }

    const row: ReportData['workouts'][number] = {
      date: w.startedAt,
      name: w.name,
      exercises: ids.map(name).join(', '),
      workingSets: countedSets(sets).length,
      volume: round1(wVol),
    };
    if (dur !== undefined) row.durationMin = Math.round(dur / 60);
    workoutRows.push(row);

    for (const id of new Set(work.map((s) => s.exerciseId))) {
      const mine = work.filter((s) => s.exerciseId === id);
      const b = bestOf(mine);
      const list = perExercise.get(id) ?? [];
      list.push({ at: w.startedAt, ...b });
      perExercise.set(id, list);
      exerciseSetCount.set(id, (exerciseSetCount.get(id) ?? 0) + mine.length);
    }
  }

  // Records: best in the period vs best of everything finished before the period.
  const before = new Map<string, { weight: number; e1rm: number }>();
  for (const w of finished) {
    if (w.startedAt >= range.start) continue;
    const sets = setsByWorkout.get(w.id) ?? [];
    for (const id of new Set(workingSets(sets).map((s) => s.exerciseId))) {
      const b = bestOf(sets.filter((s) => s.exerciseId === id));
      const cur = before.get(id) ?? { weight: 0, e1rm: 0 };
      before.set(id, { weight: Math.max(cur.weight, b.weight), e1rm: Math.max(cur.e1rm, b.e1rm) });
    }
  }
  const records: ReportData['summary']['records'] = [];
  for (const [id, list] of perExercise) {
    const prev = before.get(id);
    if (!prev) continue; // first time: everything would be a "record"
    for (const [kind, key] of [['Ciężar', 'weight'], ['Szacowany 1RM', 'e1rm']] as const) {
      const best = Math.max(...list.map((x) => x[key]));
      if (best > prev[key]) {
        const first = list.find((x) => x[key] === best)!;
        records.push({ date: first.at, exercise: name(id), kind, value: round1(best), previous: round1(prev[key]) });
      }
    }
  }
  records.sort((a, b) => a.date - b.date || a.exercise.localeCompare(b.exercise, 'pl'));

  const progress: ReportData['progress'] = [...perExercise]
    .map(([id, list]) => {
      const first = list[0];
      const last = list[list.length - 1];
      return {
        exercise: name(id),
        workingSets: exerciseSetCount.get(id) ?? 0,
        startWeight: round1(first.weight),
        endWeight: round1(last.weight),
        startE1rm: round1(first.e1rm),
        endE1rm: round1(last.e1rm),
      };
    })
    .sort((a, b) => a.exercise.localeCompare(b.exercise, 'pl'));

  const bodyInRange = input.body
    .filter((e) => e.date >= range.from && e.date <= range.to)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const bodyRows: ReportData['body'] = bodyInRange
    .map((e) => ({ date: e.date, values: entryValues(e) }))
    .filter((r) => Object.keys(r.values).length > 0);
  const bodySummary: ReportData['summary']['body'] = [];
  for (const m of BODY_METRICS) {
    const vals = bodyRows.map((r) => r.values[m.key]).filter((v): v is number => v !== undefined);
    if (vals.length === 0) continue;
    const item: ReportData['summary']['body'][number] = {
      label: m.label,
      unit: m.unit,
      start: vals[0],
      end: vals[vals.length - 1],
    };
    if (vals.length >= 2) item.change = round1(vals[vals.length - 1] - vals[0]);
    bodySummary.push(item);
  }

  return {
    from: range.from,
    to: range.to,
    summary: {
      workouts: inRange.length,
      timedWorkouts: timed,
      totalSec,
      workingSets: workingCount,
      volume: round1(volume),
      records,
      body: bodySummary,
    },
    workouts: workoutRows,
    sets: setRows,
    progress,
    body: bodyRows,
  };
}
