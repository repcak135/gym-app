import { useState } from 'react';
import { routePayload } from '../data/payloadRouter';
import './Sheet.css';
import '../pages/PlanSharePage.css';

/** Paste a shared plan or exercises link (iPhone: links open in Safari, not in the installed app). */
export default function PasteLinkSheet({
  onOpen,
  onCancel,
}: {
  /** Gets the in-app route, e.g. `/plan?d=…` or `/cwiczenia/import?d=…`. */
  onOpen: (path: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const routed = routePayload(text);
    if (routed.kind === 'unknown') {
      return setError('To nie jest link do planu ani do ćwiczeń. Wklej cały link od znajomego.');
    }
    onOpen(routed.path);
  };

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <div role="dialog" aria-label="Dodaj plan z linku" aria-modal="true" className="sheet">
        <div className="sheet__handle" aria-hidden="true" />
        <form className="confirm-sheet__body" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <p className="confirm-sheet__title">Dodaj plan z linku</p>
          <label className="name-sheet__label">
            Link od znajomego
            <textarea
              className="paste-sheet__input"
              value={text}
              autoFocus
              placeholder="https://…#/plan?d=…"
              onChange={(e) => { setText(e.target.value); setError(null); }}
            />
          </label>
          {error && <p className="name-sheet__error" role="alert">{error}</p>}
          <div className="confirm-sheet__actions">
            <button type="submit" className="confirm-sheet__btn confirm-sheet__btn--primary">
              Pokaż plan
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
