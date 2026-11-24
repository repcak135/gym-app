import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { db } from '../../data/db';
import { getExerciseHistory } from '../../data/workouts';
import ExerciseHistoryList from '../ExerciseHistoryList';
import ExerciseHowTo from '../ExerciseHowTo';
import ExerciseProgressChart from '../ExerciseProgressChart';
import NoteEditor from '../NoteEditor';
import RecordsSection from '../RecordsSection';

export type InfoTab = 'opis' | 'historia' | 'notatki' | 'statystyki';

interface Props {
  exerciseId: string;
  exerciseName: string;
  workoutId: string;
  tab: InfoTab;
  onTab: (tab: InfoTab) => void;
  onClose: () => void;
}

const TABS: { id: InfoTab; label: string }[] = [
  { id: 'opis', label: 'Opis' },
  { id: 'historia', label: 'Historia' },
  { id: 'notatki', label: 'Notatki' },
  { id: 'statystyki', label: 'Statystyki' },
];

export default function ExerciseInfoSheet({ exerciseId, exerciseName, workoutId, tab, onTab, onClose }: Props) {
  const history = useLiveQuery(() => getExerciseHistory(exerciseId, workoutId), [exerciseId, workoutId]);
  const exercise = useLiveQuery(() => db.exercises.get(exerciseId), [exerciseId]);
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-label={exerciseName} aria-modal="true" className="sheet info-sheet">
        <div className="info-sheet__bar">
          <h2>{exerciseName}</h2>
          <button type="button" className="info-sheet__close" aria-label="Zamknij" onClick={onClose}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="info-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`info-tab${tab === t.id ? ' info-tab--on' : ''}`}
              onClick={() => onTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="info-body">
          {tab === 'opis' && exercise && <ExerciseHowTo exercise={exercise} />}
          {tab === 'notatki' && <NoteEditor exerciseId={exerciseId} className="info-note" />}
          {tab === 'historia' && history && <ExerciseHistoryList history={history} />}
          {tab === 'statystyki' && history && (
            <>
              <ExerciseProgressChart history={history} emptyText="Wykres pojawi się po pierwszym treningu z ciężarem." />
              <RecordsSection exerciseId={exerciseId} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
