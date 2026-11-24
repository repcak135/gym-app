import { useLiveQuery } from 'dexie-react-hooks';
import { History } from 'lucide-react';
import { getExerciseHistory } from '../data/workouts';
import ExerciseHistoryList from './ExerciseHistoryList';

/** Exercise card: past sessions of this exercise (renders nothing without history). */
export default function ExerciseHistorySection({ exerciseId }: { exerciseId: string }) {
  const history = useLiveQuery(() => getExerciseHistory(exerciseId), [exerciseId]);
  if (!history || history.length === 0) return null;
  return (
    <section className="detail-section" aria-label="Historia">
      <p className="detail-section-title">
        <History size={14} aria-hidden="true" /> Historia
      </p>
      <ExerciseHistoryList history={history} pageSize={5} />
    </section>
  );
}
