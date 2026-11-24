import { useState } from 'react';

import type { WorkoutSet } from '../data/types';
import { updateSet, removeSet } from '../data/workouts';
import { formatKg, parseWeight } from '../data/progression';
import { rirToRpeLabel } from '../data/difficulty';
import DifficultySheet from './workout/DifficultySheet';
import './Sheet.css';
import './SetEditSheet.css';

interface SetEditSheetProps {
  set: WorkoutSet;
  showRir: boolean;
  onClose: () => void;
}

export default function SetEditSheet({ set, showRir, onClose }: SetEditSheetProps) {
  const [weightText, setWeightText] = useState(formatKg(set.weight));
  const [repsText, setRepsText] = useState(String(set.reps));
  const [warmup, setWarmup] = useState(set.warmup);
  const [rir, setRir] = useState<number | undefined>(set.rir);
  const [diffOpen, setDiffOpen] = useState(false);

  async function save() {
    const weight = parseWeight(weightText) ?? set.weight;
    const parsedReps = Number.parseInt(repsText, 10);
    const reps = Number.isFinite(parsedReps) && parsedReps >= 0 ? parsedReps : set.reps;
    await updateSet(set.id, { weight, reps, warmup, rir: rir ?? null });
    onClose();
  }

  async function remove() {
    await removeSet(set.id);
    onClose();
  }

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-label="Edytuj serię" aria-modal="true" className="sheet">
        <div className="sheet__handle" aria-hidden="true" />
        <div className="confirm-sheet__body">
          <div className="set-edit__fields">
            <label className="name-sheet__label">
              Ciężar (kg)
              <input
                className="name-sheet__input"
                aria-label="Ciężar"
                type="text"
                inputMode="decimal"
                value={weightText}
                onChange={(e) => setWeightText(e.target.value)}
              />
            </label>
            <label className="name-sheet__label">
              Powtórzenia
              <input
                className="name-sheet__input"
                aria-label="Powtórzenia"
                type="number"
                inputMode="numeric"
                min={0}
                value={repsText}
                onChange={(e) => setRepsText(e.target.value)}
              />
            </label>
          </div>

          <label className="set-edit__switch">
            <span>Rozgrzewka</span>
            <input type="checkbox" role="switch" checked={warmup} onChange={(e) => setWarmup(e.target.checked)} />
          </label>

          {(showRir || set.rir !== undefined) && (
            <div className="set-edit__switch">
              <span>Trudność</span>
              <button
                type="button"
                className="set-edit__chip"
                aria-label={`Trudność serii: ${rir !== undefined ? rirToRpeLabel(rir) : 'oceń'}`}
                onClick={() => setDiffOpen(true)}
              >
                {rir !== undefined ? rirToRpeLabel(rir) : 'Oceń'}
              </button>
            </div>
          )}
          {diffOpen && (
            <DifficultySheet
              set={{ ...set, rir }}
              onClose={() => setDiffOpen(false)}
              onPick={(v) => setRir(v === null ? undefined : v)}
            />
          )}

          <div className="confirm-sheet__actions">
            <button type="button" className="confirm-sheet__btn confirm-sheet__btn--primary" onClick={() => void save()}>
              Zapisz
            </button>
            <button type="button" className="confirm-sheet__btn confirm-sheet__btn--danger" onClick={() => void remove()}>
              Usuń serię
            </button>
            <button type="button" className="confirm-sheet__btn confirm-sheet__btn--cancel" onClick={onClose}>
              Anuluj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
