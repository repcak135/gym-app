import { Check } from 'lucide-react';
import './Sheet.css';

interface FilterSheetProps {
  title: string;             // e.g. "Mięśnie" or "Sprzęt"
  options: string[];         // raw values
  labels: (v: string) => string; // → Polish label
  value: string | null;
  onSelect: (v: string | null) => void;
  onClose: () => void;
}

export default function FilterSheet({
  title,
  options,
  labels,
  value,
  onSelect,
  onClose,
}: FilterSheetProps) {
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      className="sheet-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        role="dialog"
        aria-label={title}
        aria-modal="true"
        className="sheet"
      >
        <div className="sheet__handle" aria-hidden="true" />
        <p className="sheet__title">{title}</p>
        <div className="sheet__list" role="listbox" aria-label={title}>
          {/* "Wszystkie" clears the filter */}
          <button
            type="button"
            role="option"
            aria-selected={value === null}
            className={`sheet__option${value === null ? ' sheet__option--active' : ''}`}
            onClick={() => { onSelect(null); onClose(); }}
          >
            Wszystkie
            {value === null && <Check size={18} className="sheet__check" aria-hidden="true" />}
          </button>

          {options.map((opt) => {
            const active = value === opt;
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={active}
                className={`sheet__option${active ? ' sheet__option--active' : ''}${opt.includes(':') ? ' sheet__option--sub' : ''}`}
                onClick={() => { onSelect(opt); onClose(); }}
              >
                {labels(opt)}
                {active && <Check size={18} className="sheet__check" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
