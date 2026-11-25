import { X } from 'lucide-react';
import '../Sheet.css';
import './DifficultySheet.css';
import './ProgressionHelpSheet.css';

export default function ProgressionHelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-label="Jak działa podpowiedź?" aria-modal="true" className="sheet sheet--split diff-sheet help-sheet">
        <div className="sheet__header">
          <button type="button" className="diff-sheet__close" aria-label="Zamknij" onClick={onClose}>
            <X size={22} aria-hidden="true" />
          </button>
          <div className="diff-sheet__head">
            <h2 className="diff-sheet__title">Jak działa podpowiedź?</h2>
          </div>
        </div>
        <div className="sheet__body help-sheet__body">
          <p>Każda seria ma swój własny cel. Aplikacja patrzy, ile zrobiłeś w tej samej serii ostatnim razem.</p>
          <p>Jeśli zrobiłeś mniej niż górna granica zakresu powtórzeń — dorzuć jedno powtórzenie.</p>
          <p>Gdy seria dojdzie do górnej granicy — następnym razem weź trochę więcej kilogramów i zacznij od dołu zakresu.</p>
          <p>Kolejne serie zwykle mają mniej powtórzeń niż pierwsza — to normalne, każda rośnie we własnym tempie.</p>
          <p className="help-sheet__example-title">Przykład (zakres 8–12):</p>
          <ul className="help-sheet__example">
            <li>Seria 1: 30 kg × 12 → 32,5 kg × 8</li>
            <li>Seria 2: 30 kg × 10 → 30 kg × 11</li>
            <li>Seria 3: 30 kg × 9 → 30 kg × 10</li>
          </ul>
          <p>
            Jeśli oceniasz trudność serii, podpowiedź porówna ją z ustawieniem „Jak ciężko trenujesz?” (Ustawienia):
            za lekko — możesz dorzucić więcej; za ciężko — powtórz to samo.
          </p>
          <p>Gdy przez 3 treningi nic nie rośnie, zobaczysz propozycję, żeby zejść o ok. 10% i zbudować się od nowa.</p>
          <p>Podpowiedź to tylko propozycja — zawsze możesz wpisać swoje liczby.</p>
        </div>
      </div>
    </div>
  );
}
