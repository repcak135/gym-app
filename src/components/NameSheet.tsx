import { useState } from 'react';
import './Sheet.css';

interface NameSheetProps {
  title: string;
  initialValue?: string;
  onSave: (name: string) => void | Promise<void>;
  onCancel: () => void;
}

export default function NameSheet({ title, initialValue = '', onSave, onCancel }: NameSheetProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać');
      setBusy(false);
    }
  };

  return (
    <div
      className="sheet-backdrop sheet-backdrop--top"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <div role="dialog" aria-label={title} aria-modal="true" className="sheet">
        <form
          className="confirm-sheet__body"
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
        >
          <p className="confirm-sheet__title">{title}</p>
          <label className="name-sheet__label">
            Nazwa
            <input
              type="text"
              className="name-sheet__input"
              value={value}
              autoFocus
              onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          {error && <p className="name-sheet__error" role="alert">{error}</p>}
          <div className="confirm-sheet__actions">
            <button type="submit" className="confirm-sheet__btn confirm-sheet__btn--primary" disabled={busy}>
              Zapisz
            </button>
            <button type="button" className="confirm-sheet__btn confirm-sheet__btn--cancel" onClick={onCancel}>
              Anuluj
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
