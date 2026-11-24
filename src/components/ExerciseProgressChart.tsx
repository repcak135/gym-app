import { epley1RM } from '../data/progression';
import type { Workout, WorkoutSet } from '../data/types';
import MiniChart from './workout/MiniChart';
import { formatDay } from '../pages/planFormat';

/** Heaviest working set and estimated 1RM per workout, oldest → newest (card and workout sheet). */
export default function ExerciseProgressChart({
  history,
  emptyText,
}: {
  history: { workout: Workout; sets: WorkoutSet[] }[];
  /** Shown when there is no weighted working set yet; omit to render nothing. */
  emptyText?: string;
}) {
  const points = [...history]
    .reverse()
    .map(({ workout, sets }) => {
      const working = sets.filter((s) => !s.warmup && s.reps > 0);
      return {
        t: workout.startedAt,
        weight: Math.max(0, ...working.map((s) => s.weight)),
        e1rm: Math.max(0, ...working.map((s) => epley1RM(s.weight, s.reps))),
      };
    })
    .filter((p) => p.weight > 0);
  if (points.length === 0) return emptyText ? <p className="info-empty">{emptyText}</p> : null;
  return (
    <MiniChart
      points={points.map((p) => ({ label: formatDay(p.t).slice(0, 5), a: p.weight, b: p.e1rm }))}
      labelA="Ciężar"
      labelB="Szac. 1RM"
    />
  );
}
