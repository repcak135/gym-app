import { X } from 'lucide-react';
import type { WorkoutSet } from '../../data/types';
import { DIFFICULTY_LEVELS } from '../../data/difficulty';
import { formatKg } from '../../data/progression';
import { updateSet } from '../../data/workouts';
import '../Sheet.css';
import './DifficultySheet.css';

interface Props {
  set: WorkoutSet;
  onClose: () => void;
  /** When given, the choice is handed to the caller instead of being saved to the set. */
  onPick?: (rir: number | null) => void;
}

export default function DifficultySheet({ set, onClose, onPick }: Props) {
  const pick = async (rir: number | null) => {
    if (onPick) onPick(rir);
    else await updateSet(set.id, { rir });
    onClose();
  };

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-label="Jak ciężka była ta seria?" aria-modal="true" className="sheet diff-sheet">
        <button type="button" className="diff-sheet__close" aria-label="Zamknij" onClick={onClose}>
          <X size={22} aria-hidden="true" />
        </button>
        <div className="diff-sheet__head">
          <h2 className="diff-sheet__title">Jak ciężka była ta seria?</h2>
          <p className="diff-sheet__sub">{formatKg(set.weight)} kg × {set.reps}</p>
        </div>
        <div className="diff-sheet__list" role="radiogroup" aria-label="Trudność serii">
          {DIFFICULTY_LEVELS.map((l) => {
            const active = set.rir !== undefined && Math.min(5, set.rir) === l.rir;
            return (
              <button
                key={l.rir}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`RPE ${l.rpe} — ${l.label}, ${l.spoken}`}
                className={`diff-row${active ? ' diff-row--active' : ''}`}
                style={{ ['--diff-color' as string]: l.color }}
                onClick={() => void pick(l.rir)}
              >
                <span className="diff-row__bar" aria-hidden="true" />
                <span className="diff-row__num" aria-hidden="true">{l.rpe}</span>
                <span className="diff-row__text" aria-hidden="true">
                  <strong>{l.label}</strong>
                  <span>{l.description}</span>
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" className="diff-sheet__clear" onClick={() => void pick(null)}>
          Wyczyść ocenę
        </button>
      </div>
    </div>
  );
}
