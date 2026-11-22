import './Sheet.css';

export interface SheetAction {
  label: string;
  kind?: 'primary' | 'danger' | 'cancel';
  disabled?: boolean;
  onClick: () => void;
}

interface ActionSheetProps {
  title: string;
  message?: string;
  actions: SheetAction[];
  onCancel: () => void;
}

export default function ActionSheet({ title, message, actions, onCancel }: ActionSheetProps) {
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
          {message && <p className="action-sheet__message">{message}</p>}
          <div className="confirm-sheet__actions">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                disabled={a.disabled}
                className={`confirm-sheet__btn confirm-sheet__btn--${a.kind ?? 'cancel'}`}
                onClick={a.onClick}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
