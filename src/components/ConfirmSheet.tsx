import './Sheet.css';

interface ConfirmSheetProps {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmSheet({ title, onConfirm, onCancel }: ConfirmSheetProps) {
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <div role="dialog" aria-label={title} aria-modal="true" className="sheet">
        <div className="sheet__handle" aria-hidden="true" />
        <div className="confirm-sheet__body">
          <p className="confirm-sheet__title">{title}</p>
          <div className="confirm-sheet__actions">
            <button type="button" className="confirm-sheet__btn confirm-sheet__btn--danger" onClick={onConfirm}>
              Usuń
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
