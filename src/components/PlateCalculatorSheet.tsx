import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise } from '../data/types';
import { db } from '../data/db';
import { BAR_WEIGHT_OPTIONS, getSettings } from '../data/settings';
import { formatKg, parseWeight } from '../data/progression';
import { calculatePlates } from '../data/plates';
import './Sheet.css';
import './PlateCalculatorSheet.css';

interface Props {
  initialWeight?: number;
  exercise?: Exercise;
  onUse?: (kg: number) => void;
  onClose: () => void;
}

function plateColor(kg: number): string {
  switch (kg) {
    case 25: return '#d64545';
    case 20: return '#3b82d6';
    case 15: return '#e6c229';
    case 10: return '#3fb56b';
    case 5: return '#eceef2';
    case 2.5: return '#8c2b2b';
    case 1.25: return '#b8bec9';
    default: return '#6b7280';
  }
}

function plateHeight(kg: number): number {
  return Math.round(Math.max(18, Math.min(72, 18 + (kg / 25) * 54)));
}

function BarDrawing({ perSide }: { perSide: number[] }) {
  const plates = perSide.map((kg, i) => (
    <span
      key={i}
      className="plate-calc__plate"
      style={{ height: plateHeight(kg), background: plateColor(kg) }}
    />
  ));
  return (
    <div className="plate-calc__bar" role="img" aria-label="Sztanga">
      <div className="plate-calc__side plate-calc__side--left">{[...plates].reverse()}</div>
      <div className="plate-calc__shaft" />
      <div className="plate-calc__side">{plates}</div>
    </div>
  );
}

export default function PlateCalculatorSheet({ initialWeight, exercise, onUse, onClose }: Props) {
  const settings = useLiveQuery(() => getSettings(), []);
  const [text, setText] = useState(initialWeight !== undefined && initialWeight > 0 ? formatKg(initialWeight) : '');
  const [barOverride, setBarOverride] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  const bar = barOverride ?? exercise?.barWeight ?? settings?.barWeight ?? 20;
  const barOptions = BAR_WEIGHT_OPTIONS.includes(bar)
    ? BAR_WEIGHT_OPTIONS
    : [...BAR_WEIGHT_OPTIONS, bar].sort((a, b) => a - b);

  const target = parseWeight(text);
  const result = settings && target !== null && target > 0 ? calculatePlates(target, bar, settings.plates) : null;

  const changeBar = (value: number) => {
    setBarOverride(value);
    if (exercise) {
      void db.exercises.update(exercise.id, { barWeight: value });
      setSaved(true);
    }
  };

  const use = () => {
    if (!result || !onUse) return;
    onUse(result.total);
    onClose();
  };

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-label="Kalkulator talerzy" aria-modal="true" className="sheet">
        <div className="sheet__handle" aria-hidden="true" />
        <div className="confirm-sheet__body plate-calc">
          <label className="name-sheet__label">
            Ciężar docelowy
            <input
              className="name-sheet__input"
              inputMode="decimal"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <label className="name-sheet__label">
            Gryf
            <select
              className="name-sheet__input"
              value={bar}
              onChange={(e) => changeBar(Number(e.target.value))}
            >
              {barOptions.map((w) => (
                <option key={w} value={w}>{formatKg(w)} kg</option>
              ))}
            </select>
          </label>
          {exercise && saved && <p className="plate-calc__hint">Zapamiętane dla tego ćwiczenia</p>}

          {result && (
            <div className="plate-calc__result">
              <p className="plate-calc__heading">Na każdą stronę:</p>
              {result.perSide.length > 0 ? (
                <ul className="plate-calc__chips" aria-label="Talerze">
                  {result.perSide.map((kg, i) => (
                    <li key={i} className="plate-calc__chip">
                      <span className="plate-calc__dot" style={{ background: plateColor(kg) }} aria-hidden="true" />
                      {formatKg(kg)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="plate-calc__chips-text">Sam gryf</p>
              )}
              <BarDrawing perSide={result.perSide} />
              {!result.exact && (
                <div className="plate-calc__near">
                  <p>Nie da się dokładnie ułożyć {formatKg(target ?? 0)} kg.</p>
                  <p className="plate-calc__near-label">Najbliżej:</p>
                  <div className="plate-calc__near-btns">
                    {result.lower && (
                      <button type="button" onClick={() => setText(formatKg(result.lower!.total))}>
                        {formatKg(result.lower.total)} kg
                      </button>
                    )}
                    {result.higher && (
                      <button type="button" onClick={() => setText(formatKg(result.higher!.total))}>
                        {formatKg(result.higher.total)} kg
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="confirm-sheet__actions">
            {onUse && result && (
              <button type="button" className="confirm-sheet__btn confirm-sheet__btn--primary" onClick={use}>
                Użyj {formatKg(result.total)} kg
              </button>
            )}
            <button type="button" className="confirm-sheet__btn confirm-sheet__btn--cancel" onClick={onClose}>
              Zamknij
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
