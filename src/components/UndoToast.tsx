import { hideToast, useToast } from '../undo';
import './UndoToast.css';

export default function UndoToast() {
  const toast = useToast();
  return (
    <div className="toast-host" aria-live="polite">
      {toast && (
        <div key={toast.id} className="toast">
          <span className="toast__msg">{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              className="toast__undo"
              onClick={() => {
                const undo = toast.undo!;
                hideToast();
                void undo();
              }}
            >
              Cofnij
            </button>
          )}
        </div>
      )}
    </div>
  );
}
