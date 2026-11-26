import { exerciseMuscleLabels, equipmentLabel } from '../data/exerciseLabels';
import type { Exercise } from '../data/types';
import { matchedAlias } from '../data/exercises';
import ExerciseThumb from './ExerciseThumb';

/** Inside of an exercise list row (Ćwiczenia tab and picker): photo, name, matched other name, Polish name, muscles · equipment. */
export default function ExerciseRowContent({ exercise: ex, size = 56, query }: { exercise: Exercise; size?: number; query?: string }) {
  // Found by gym slang or the user's own name: show which one ("Allahy").
  const alias = matchedAlias(ex, query);
  const meta = [exerciseMuscleLabels(ex, 'primary').join(', '), equipmentLabel(ex.equipment)]
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
        {alias && <span className="exercise-row__alias">„{alias}”</span>}
        {ex.nameEn && <span className="exercise-row__pl">{ex.nameEn}</span>}
        <span className="exercise-row__meta">{meta}</span>
      </span>
    </>
  );
}
