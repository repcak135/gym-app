import { useState } from 'react';
import { Plus, X } from 'lucide-react';

import { setUserNames } from '../data/exercises';
import { SLANG } from '../data/slang';
import type { Exercise } from '../data/types';

/**
 * "Inne nazwy" on the exercise card: built-in gym slang (read-only) and the user's own
 * names (add / remove). All of them work in every exercise search.
 */
export default function OtherNames({ exercise }: { exercise: Exercise }) {
  const [text, setText] = useState('');
  const own = exercise.userNames ?? [];
  const slang = SLANG[exercise.id] ?? [];

  const add = () => {
    const name = text.trim();
    if (!name) return;
    void setUserNames(exercise.id, [...own, name]);
    setText('');
  };

  return (
    <section className="detail-section" aria-labelledby="other-names">
      <p className="detail-section-title" id="other-names">Inne nazwy</p>
      {(own.length > 0 || slang.length > 0) && (
        <ul className="other-names" aria-label="Inne nazwy">
          {own.map((n) => (
            <li key={`u:${n}`} className="chip chip--primary other-names__chip">
              {n}
              <button
                type="button"
                className="other-names__remove"
                aria-label={`Usuń nazwę ${n}`}
                onClick={() => void setUserNames(exercise.id, own.filter((x) => x !== n))}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
          {slang.map((n) => (
            <li key={`s:${n}`} className="chip chip--secondary">{n}</li>
          ))}
        </ul>
      )}
      <form
        className="other-names__add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          type="text"
          className="detail-select"
          placeholder="np. nazwa z Twojej siłowni"
          aria-label="Nowa inna nazwa"
          value={text}
          maxLength={60}
          onChange={(e) => setText(e.target.value)}
          autoCorrect="off"
        />
        <button type="submit" className="detail-btn detail-btn--edit other-names__btn" disabled={!text.trim()}>
          <Plus size={16} aria-hidden="true" /> Dodaj
        </button>
      </form>
      <p className="other-names__hint">Wyszukiwarka znajdzie ćwiczenie także po tych nazwach.</p>
    </section>
  );
}
