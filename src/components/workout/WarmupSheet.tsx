import { X } from 'lucide-react';
import '../Sheet.css';
import './DifficultySheet.css';
import './WarmupSheet.css';
import { formatKg } from '../../data/progression';

interface Props {
  work: number;
  ramp: { weight: number; reps: number }[];
  /** The exercise already has not-yet-done warm-ups that this would replace. */
  replaces: boolean;
  onAdd: () => void;
  onClose: () => void;
}

export default function WarmupSheet({ work, ramp, replaces, onAdd, onClose }: Props) {
  const title = `Rozgrzewka przed ${formatKg(work)} kg`;
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-label={title} aria-modal="true" className="sheet diff-sheet warmup-sheet">
        <button type="button" className="diff-sheet__close" aria-label="Zamknij" onClick={onClose}>
          <X size={22} aria-hidden="true" />
        </button>
        <div className="diff-sheet__head">
          <h2 className="diff-sheet__title">{title}</h2>
        </div>
        <div className="warmup-sheet__body">
          {ramp.length === 0 ? (
            <>
              <p>Ten ciężar jest na tyle lekki, że rozgrzewka nie jest potrzebna.</p>
              <button type="button" className="warmup-sheet__btn" onClick={onClose}>
                Zamknij
              </button>
            </>
          ) : (
            <>
              <ol className="warmup-sheet__list" aria-label="Proponowane serie">
                {ramp.map((r, i) => (
                  <li key={i}>
                    <span className="warmup-sheet__num">R{i + 1}</span>
                    <span>{formatKg(r.weight)} kg × {r.reps}</span>
                  </li>
                ))}
              </ol>
              <p>Lekkie serie przed właściwymi — rozgrzewają mięśnie i stawy, nie męczą.</p>
              {replaces && <p className="warmup-sheet__replace">Zastąpi obecne serie rozgrzewkowe.</p>}
              <button type="button" className="warmup-sheet__btn warmup-sheet__btn--primary" onClick={onAdd}>
                Dodaj rozgrzewkę
              </button>
              <button type="button" className="warmup-sheet__btn" onClick={onClose}>
                Anuluj
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
