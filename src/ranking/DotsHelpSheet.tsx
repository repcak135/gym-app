import { X } from 'lucide-react';
import { dots } from '../data/dots';
import '../components/Sheet.css';
import '../components/workout/DifficultySheet.css';
import '../components/workout/ProgressionHelpSheet.css';

/** Example in the sheet: 100 kg at 80 kg body weight (man), computed with the real formula. */
export const EXAMPLE_POINTS = dots(100, 80, 'm');
const fmt = (v: number) => v.toFixed(1).replace('.', ',');

/** Ranking › Ławka (DOTS) › "i": how the points are counted, in plain Polish. */
export default function DotsHelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-label="Jak liczymy punkty" aria-modal="true" className="sheet sheet--split diff-sheet help-sheet">
        <div className="sheet__header">
          <button type="button" className="diff-sheet__close" aria-label="Zamknij" onClick={onClose}>
            <X size={22} aria-hidden="true" />
          </button>
          <div className="diff-sheet__head">
            <h2 className="diff-sheet__title">Jak liczymy punkty</h2>
          </div>
        </div>
        <div className="sheet__body help-sheet__body">
          <p>Liczy się najcięższe zaliczone wyciśnięcie sztangi na ławce płaskiej — choćby na 1 powtórzenie. Bez szacowania i bez serii rozgrzewkowych.</p>
          <p>
            Punkty to DOTS — wzór z trójboju siłowego, który uwzględnia masę ciała i płeć, żeby dało się uczciwie porównać lżejsze i cięższe
            osoby, kobiety i mężczyzn.
          </p>
          <p>Masa ciała pochodzi z wpisu w Statystyki › Ciało z dnia tego wyciśnięcia (albo z najbliższego wcześniejszego wpisu).</p>
          <p>To rekord wszech czasów: liczy się najlepszy wynik z całej historii treningów.</p>
          <p className="help-sheet__example-title">Przykład:</p>
          <ul className="help-sheet__example">
            <li>100 kg przy 80 kg masy ciała (mężczyzna) ≈ {fmt(EXAMPLE_POINTS)} pkt</li>
          </ul>
          <p>Do serwera trafiają tylko punkty — nie ciężar, nie masa ciała, nie płeć.</p>
        </div>
      </div>
    </div>
  );
}
