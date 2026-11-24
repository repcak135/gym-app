import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { unlockAudio } from '../audio/beep';
import { getActiveWorkout, startWorkout } from '../data/workouts';
import './Sheet.css';

/** Starts a workout from a plan day; with a workout already running, offers to go back to it instead. */
export function useStartDay(): { start: (planId: string, dayId: string) => void; sheet: ReactNode } {
  const navigate = useNavigate();
  const [activeName, setActiveName] = useState<string | null>(null);

  const start = (planId: string, dayId: string) => {
    unlockAudio();
    void getActiveWorkout().then((active) => {
      if (active) {
        setActiveName(active.name);
        return;
      }
      return startWorkout({ planId, dayId }).then(() => navigate('/trening'));
    });
  };

  const close = () => setActiveName(null);
  const title = `Masz trwający trening „${activeName}”`;
  const sheet =
    activeName === null ? null : (
      <div
        className="sheet-backdrop"
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
      >
        <div role="dialog" aria-label={title} aria-modal="true" className="sheet">
          <div className="sheet__handle" aria-hidden="true" />
          <div className="confirm-sheet__body">
            <p className="confirm-sheet__title">{title}</p>
            <div className="confirm-sheet__actions">
              <button
                type="button"
                className="confirm-sheet__btn confirm-sheet__btn--primary"
                onClick={() => { close(); navigate('/trening'); }}
              >
                Wróć do treningu
              </button>
              <button type="button" className="confirm-sheet__btn confirm-sheet__btn--cancel" onClick={close}>
                Anuluj
              </button>
            </div>
          </div>
        </div>
      </div>
    );

  return { start, sheet };
}
