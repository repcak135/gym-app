import { db } from './db';
import { workoutDurationSec } from './history';
import { bodyPartsOf, MUSCLE_GROUPS, muscleGroup, type BodyPart, type MuscleGroup } from './muscleMap';
import { countedSets } from './records';
import { weekStartOf } from './motivation';
import { isFinished } from './workouts';
import type { Workout, WorkoutSet } from './types';
import { deltHeadsOf, type DeltHead, type Delts } from './deltHeads';

export type Period = 'week' | 'month' | 'year' | 'all';

export interface PeriodRange {
  start: number;
  /** Exclusive. */
  end: number;
  label: string;
}

export interface StatsInput {
  workouts: Workout[];
  sets: WorkoutSet[];
  muscles: Map<string, { primary: string[]; secondary: string[]; delts?: Delts }>;
}

export type ShoulderHeadKey = DeltHead | 'unknown';

function emptyHeads(): Record<ShoulderHeadKey, number> {
  return { front: 0, side: 0, rear: 0, unknown: 0 };
}

export interface PeriodStats {
  workouts: number;
  timedWorkouts: number;
  untimedWorkouts: number;
  totalSec: number;
  avgSec?: number;
  workingSets: number;
  byGroup: { primary: Record<MuscleGroup, number>; secondary: Record<MuscleGroup, number> };
  /** Barki split by deltoid head ('unknown' = shoulder sets of exercises without heads); same rules as `byGroup`. */
  shoulderHeads: { primary: Record<ShoulderHeadKey, number>; secondary: Record<ShoulderHeadKey, number> };
  unmappedSets: number;
  byBody: Partial<Record<BodyPart, number>>;
}

const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const MONTHS_FULL = [
  'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
];

const mondayOf = weekStartOf;

function addDays(t: number, days: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

export function periodRange(period: Period, offset: number, now: number, firstAt?: number): PeriodRange {
  const n = new Date(now);
  if (period === 'week') {
    const start = mondayOf(now, offset);
    const end = addDays(start, 7);
    const a = new Date(start);
    const b = new Date(addDays(start, 6));
    const label =
      a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
        ? `${a.getDate()}–${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`
        : `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`;
    return { start, end, label };
  }
  if (period === 'month') {
    const start = new Date(n.getFullYear(), n.getMonth() + offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return {
      start: start.getTime(),
      end: end.getTime(),
      label: `${MONTHS_FULL[start.getMonth()]} ${start.getFullYear()}`,
    };
  }
  if (period === 'year') {
    const y = n.getFullYear() + offset;
    return { start: new Date(y, 0, 1).getTime(), end: new Date(y + 1, 0, 1).getTime(), label: String(y) };
  }
  return { start: firstAt ?? now, end: addDays(now, 1), label: 'Wszystko' };
}

function emptyGroups(): Record<MuscleGroup, number> {
  return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g.key, 0])) as Record<MuscleGroup, number>;
}

function distinctGroups(muscles: string[]): Set<MuscleGroup> {
  const out = new Set<MuscleGroup>();
  for (const m of muscles) {
    const g = muscleGroup(m);
    if (g) out.add(g);
  }
  return out;
}

function distinctParts(muscles: string[], heads: DeltHead[] = []): Set<BodyPart> {
  return new Set(bodyPartsOf(muscles, heads));
}

/** One set counted once per deltoid head of the role ('unknown' when shoulders is listed but no heads are known). */
function countHeads(
  into: Record<ShoulderHeadKey, number>,
  muscles: string[],
  delts: Delts | undefined,
  role: 'primary' | 'secondary',
) {
  if (!muscles.includes('shoulders')) return;
  const heads = deltHeadsOf({ delts }, role);
  if (heads.length === 0) into.unknown++;
  for (const h of heads) into[h]++;
}

export function computeStats(input: StatsInput, range: PeriodRange): PeriodStats {
  const inRange = input.workouts.filter(
    (w) => isFinished(w) && w.startedAt >= range.start && w.startedAt < range.end,
  );
  const ids = new Set(inRange.map((w) => w.id));

  let timed = 0;
  let totalSec = 0;
  for (const w of inRange) {
    const d = workoutDurationSec(w);
    if (d !== undefined) {
      timed++;
      totalSec += d;
    }
  }

  const sets = countedSets(input.sets.filter((s) => ids.has(s.workoutId)));
  const primary = emptyGroups();
  const secondary = emptyGroups();
  const heads = { primary: emptyHeads(), secondary: emptyHeads() };
  const byBody: Partial<Record<BodyPart, number>> = {};
  let unmapped = 0;

  for (const s of sets) {
    const m = input.muscles.get(s.exerciseId);
    if (!m || m.primary.length === 0) unmapped++;
    if (!m) continue;
    for (const g of distinctGroups(m.primary)) primary[g]++;
    for (const g of distinctGroups(m.secondary)) secondary[g]++;
    countHeads(heads.primary, m.primary, m.delts, 'primary');
    countHeads(heads.secondary, m.secondary, m.delts, 'secondary');
    const pParts = distinctParts(m.primary, deltHeadsOf({ delts: m.delts }, 'primary'));
    for (const p of pParts) byBody[p] = (byBody[p] ?? 0) + 1;
    for (const p of distinctParts(m.secondary, deltHeadsOf({ delts: m.delts }, 'secondary'))) {
      if (!pParts.has(p)) byBody[p] = (byBody[p] ?? 0) + 0.5;
    }
  }

  return {
    workouts: inRange.length,
    timedWorkouts: timed,
    untimedWorkouts: inRange.length - timed,
    totalSec,
    avgSec: timed > 0 ? Math.round(totalSec / timed) : undefined,
    workingSets: sets.length,
    byGroup: { primary, secondary },
    shoulderHeads: heads,
    unmappedSets: unmapped,
    byBody,
  };
}

export function daysSinceTrained(input: StatsInput, now: number): Partial<Record<BodyPart, number>> {
  const finished = new Set(input.workouts.filter(isFinished).map((w) => w.id));
  const last = new Map<BodyPart, number>();
  for (const s of countedSets(input.sets.filter((x) => finished.has(x.workoutId)))) {
    const m = input.muscles.get(s.exerciseId);
    if (!m) continue;
    const at = s.completedAt as number;
    for (const p of distinctParts(m.primary, deltHeadsOf({ delts: m.delts }, 'primary'))) {
      if ((last.get(p) ?? -Infinity) < at) last.set(p, at);
    }
  }
  const n = new Date(now);
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  const out: Partial<Record<BodyPart, number>> = {};
  for (const [p, at] of last) {
    const d = new Date(at);
    const day = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    out[p] = Math.max(0, Math.round((today - day) / 86_400_000));
  }
  return out;
}

export function weeklyCounts(
  input: StatsInput,
  range: PeriodRange,
  period: Period,
): { weekStart: number; count: number }[] {
  const starts: number[] = [];
  if (period === 'week') {
    for (let i = 11; i >= 0; i--) starts.push(mondayOf(range.start, -i));
  } else {
    for (let t = mondayOf(range.start); t < range.end; t = addDays(t, 7)) starts.push(t);
  }
  const finished = input.workouts.filter(isFinished);
  return starts.map((weekStart) => {
    const next = addDays(weekStart, 7);
    // Weeks only partly inside a month/year/all range count just the workouts inside it,
    // so the bars add up to the "Treningi" tile.
    const lo = period === 'week' ? weekStart : Math.max(weekStart, range.start);
    const hi = period === 'week' ? next : Math.min(next, range.end);
    return { weekStart, count: finished.filter((w) => w.startedAt >= lo && w.startedAt < hi).length };
  });
}

export async function loadStatsInput(): Promise<StatsInput> {
  const [workouts, sets, exercises] = await Promise.all([
    db.workouts.toArray(),
    db.sets.toArray(),
    db.exercises.toArray(),
  ]);
  const muscles = new Map(
    exercises.map((e) => [e.id, { primary: e.primaryMuscles, secondary: e.secondaryMuscles, delts: e.delts }] as const),
  );
  return { workouts, sets, muscles };
}
