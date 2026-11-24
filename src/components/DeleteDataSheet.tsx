import { useState } from 'react';
import { Link } from 'react-router';

import type { UserDataCounts } from '../data/wipe';
import { plural, setsLabel, workoutsLabel } from '../data/plural';
import './Sheet.css';
import './DeleteDataSheet.css';

export type DeleteMode = 'imported' | 'all';

export const isDeleteWord = (text: string) => {
  const t = text.trim().toLocaleUpperCase('pl-PL');
  return t === 'USUŃ' || t === 'USUN';
};

/** Lines describing what a deletion removes. */
export function deletionSummary(mode: DeleteMode, c: UserDataCounts): string[] {
  if (mode === 'imported') return [`${workoutsLabel(c.importedWorkouts)}, ${setsLabel(c.importedSets)}`];
  const lines = [`${workoutsLabel(c.workouts)}, ${setsLabel(c.sets)}`];
  lines.push(`${c.plans} ${plural(c.plans, 'plan', 'plany', 'planów')}`);
  lines.push(`${c.notes} ${plural(c.notes, 'notatka', 'notatki', 'notatek')}`);
  lines.push(`${c.measurements} ${plural(c.measurements, 'pomiar ciała', 'pomiary ciała', 'pomiarów ciała')}`);
  lines.push(`${c.customExercises} ${plural(c.customExercises, 'własne ćwiczenie', 'własne ćwiczenia', 'własnych ćwiczeń')}`);
  lines.push('ustawienia wrócą do domyślnych');
  return lines;
}

interface Props {
  mode: DeleteMode;
  counts: UserDataCounts;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteDataSheet({ mode, counts, busy, onConfirm, onCancel }: Props) {
  const [text, setText] = useState('');
  const title = mode === 'imported' ? 'Usunąć zaimportowaną historię?' : 'Usunąć wszystkie dane?';
  const ok = isDeleteWord(text) && !busy;

  return (
    <div
      className="sheet-backdrop sheet-backdrop--top"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <div role="dialog" aria-label={title} aria-modal="true" className="sheet">
        <div className="confirm-sheet__body">
          <p className="confirm-sheet__title">{title}</p>
          <p className="action-sheet__message">
            {mode === 'imported'
              ? 'Zostaną usunięte treningi z importu CSV razem z seriami. Treningi zrobione w aplikacji, plany i reszta zostają.'
              : 'Zostanie usunięte wszystko poza wbudowaną bazą ćwiczeń. Tego nie da się cofnąć.'}
          </p>
          <ul className="del-sheet__list" aria-label="Co zostanie usunięte">
            {deletionSummary(mode, counts).map((l) => <li key={l}>{l}</li>)}
          </ul>
          <Link to="/ustawienia/kopia" className="del-sheet__backup" onClick={onCancel}>
            Najpierw zrób kopię zapasową
          </Link>
          <label className="name-sheet__label">
            Wpisz USUŃ, aby potwierdzić
            <input
              className="name-sheet__input"
              type="text"
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="confirm-sheet__actions">
            <button
              type="button"
              className="confirm-sheet__btn confirm-sheet__btn--danger"
              disabled={!ok}
              onClick={onConfirm}
            >
              {busy ? 'Usuwam…' : 'Usuń'}
            </button>
            <button type="button" className="confirm-sheet__btn confirm-sheet__btn--cancel" onClick={onCancel}>
              Anuluj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
