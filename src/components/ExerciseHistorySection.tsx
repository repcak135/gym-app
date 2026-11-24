import { useLiveQuery } from 'dexie-react-hooks';
import { History, TrendingUp } from 'lucide-react';
import { getExerciseHistory } from '../data/workouts';
import ExerciseHistoryList from './ExerciseHistoryList';
import ExerciseProgressChart from './ExerciseProgressChart';
import './workout/MiniChart.css';

/** Exercise card: progress chart and past sessions (same as the workout info sheet; nothing without history). */
export default function ExerciseHistorySection({ exerciseId }: { exerciseId: string }) {
  const history = useLiveQuery(() => getExerciseHistory(exerciseId), [exerciseId]);
  if (!history || history.length === 0) return null;
  return (
    <>
    {history.length > 1 && (
      <section className="detail-section" aria-label="Postęp">
        <p className="detail-section-title">
          <TrendingUp size={14} aria-hidden="true" /> Postęp
        </p>
        <ExerciseProgressChart history={history} />
      </section>
    )}
    <section className="detail-section" aria-label="Historia">
      <p className="detail-section-title">
        <History size={14} aria-hidden="true" /> Historia
      </p>
      <ExerciseHistoryList history={history} pageSize={5} />
    </section>
    </>
  );
}
