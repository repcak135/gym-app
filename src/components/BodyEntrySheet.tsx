import { useState } from 'react';

import { BODY_METRICS, entryValues, saveBodyEntry } from '../data/body';
import { removeBodyEntryUndoable } from '../data/undoable';
import { showUndo } from '../undo';
import type { BodyEntry, BodyMetric } from '../data/types';
import ConfirmSheet from './ConfirmSheet';
import './Sheet.css';
import './BodyEntrySheet.css';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toText(v: number | undefined): string {
  return v === undefined ? '' : String(v).replace('.', ',');
}

/** Parses "82,5" / "82.5"; empty → undefined; anything else → NaN (reported). */
function parse(text: string): number | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : Number.NaN;
}

/** Add or edit one body entry: date + any subset of weight, fat % and circumferences. */
export default function BodyEntrySheet({ entry, onClose }: { entry?: BodyEntry; onClose: () => void }) {
  const [date, setDate] = useState(entry?.date ?? today());
  const [texts, setTexts] = useState<Partial<Record<BodyMetric, string>>>(() => {
    const vals = entry ? entryValues(entry) : {};
    return Object.fromEntries(BODY_METRICS.map((m) => [m.key, toText(vals[m.key])]));
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    const values: Partial<Record<BodyMetric, number>> = {};
    for (const m of BODY_METRICS) {
      const v = parse(texts[m.key] ?? '');
      if (v === undefined) continue;
      if (Number.isNaN(v)) {
        setError(`Popraw pole „${m.label}” (liczba większa od zera)`);
        return;
      }
      values[m.key] = v;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Wybierz datę');
      return;
    }
    try {
      await saveBodyEntry({ id: entry?.id, date, values });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (confirmDelete && entry) {
    return (
      <ConfirmSheet
        title="Usunąć ten pomiar?"
        onConfirm={async () => {
          const restore = await removeBodyEntryUndoable(entry.id);
          showUndo('Usunięto pomiar', restore);
          onClose();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    );
  }

  const title = entry ? 'Edytuj pomiar' : 'Dodaj pomiar';
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-label={title} aria-modal="true" className="sheet body-sheet">
        <div className="sheet__handle" aria-hidden="true" />
        <div className="confirm-sheet__body">
          <p className="confirm-sheet__title">{title}</p>
          <label className="name-sheet__label">
            Data
            <input
              className="name-sheet__input"
              type="date"
              aria-label="Data"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <p className="body-sheet__hint">Wpisz tylko to, co mierzysz — puste pola się nie zapisują.</p>
          <div className="body-sheet__grid">
            {BODY_METRICS.map((m) => (
              <label key={m.key} className="name-sheet__label body-sheet__field">
                <span>
                  {m.label} <span className="body-sheet__unit">({m.unit})</span>
                </span>
                <input
                  className="name-sheet__input"
                  aria-label={m.label}
                  type="text"
                  inputMode="decimal"
                  value={texts[m.key] ?? ''}
                  onChange={(e) => {
                    setTexts((t) => ({ ...t, [m.key]: e.target.value }));
                    setError(null);
                  }}
                />
              </label>
            ))}
          </div>
          {error && (
            <p className="name-sheet__error" role="alert">
              {error}
            </p>
          )}
          <div className="confirm-sheet__actions body-sheet__actions">
            <button type="button" className="confirm-sheet__btn confirm-sheet__btn--primary" onClick={save}>
              Zapisz
            </button>
            {entry && (
              <button
                type="button"
                className="confirm-sheet__btn confirm-sheet__btn--danger"
                onClick={() => setConfirmDelete(true)}
              >
                Usuń wpis
              </button>
            )}
            <button type="button" className="confirm-sheet__btn confirm-sheet__btn--cancel" onClick={onClose}>
              Anuluj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
