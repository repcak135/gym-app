import { muscleLabel, equipmentLabel } from '../data/exerciseLabels';
import type { Exercise } from '../data/types';
import ExerciseThumb from './ExerciseThumb';

/** Inside of an exercise list row (Ćwiczenia tab and picker): photo, name, Polish name, muscles · equipment. */
export default function ExerciseRowContent({ exercise: ex, size = 56 }: { exercise: Exercise; size?: number }) {
  const meta = [ex.primaryMuscles.map(muscleLabel).join(', '), equipmentLabel(ex.equipment)]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <ExerciseThumb exercise={ex} size={size} />
      <span className="exercise-row__info">
        <span className="exercise-row__name">
          {ex.name}
          {ex.custom && <span className="badge-custom">Własne</span>}
        </span>
        {ex.namePl && <span className="exercise-row__pl">{ex.namePl}</span>}
        <span className="exercise-row__meta">{meta}</span>
      </span>
    </>
  );
}
