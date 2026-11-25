import { useState, useEffect } from 'react';

import { db } from '../data/db';
import {
  createCustomExercise,
  updateCustomExercise,
  saveNote,
} from '../data/exercises';
import {
  MUSCLES,
  EQUIPMENT,
  muscleLabel,
  equipmentLabel,
} from '../data/exerciseLabels';
import { DELT_LABEL, deltHeadsOf, type DeltHead } from '../data/deltHeads';
import { MEASURE_OPTIONS } from '../data/measure';
import type { Measure } from '../data/types';
import '../pages/ExerciseFormPage.css';

/**
 * The custom exercise form: on its own page (Ćwiczenia › +, edit) and in a sheet
 * from the exercise picker ("Utwórz własne ćwiczenie").
 */
export default function ExerciseForm({
  exerciseId = null,
  initialName = '',
  onSaved,
  onCancel,
}: {
  /** Edit this custom exercise; null = create a new one. */
  exerciseId?: string | null;
  /** Prefilled name for a new exercise (e.g. the search text). */
  initialName?: string;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [primaryMuscles, setPrimaryMuscles] = useState<string[]>([]);
  const [secondaryMuscles, setSecondaryMuscles] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [measure, setMeasure] = useState<Measure>('reps');
  const [deltHeads, setDeltHeads] = useState<DeltHead[]>([]);
  const [noteText, setNoteText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fill the form once when editing.
  useEffect(() => {
    if (!exerciseId) return;
    let cancelled = false;
    void Promise.all([db.exercises.get(exerciseId), db.notes.get(exerciseId)]).then(([ex, note]) => {
      if (cancelled) return;
      if (ex) {
        setName(ex.name);
        setPrimaryMuscles([...ex.primaryMuscles]);
        setSecondaryMuscles([...ex.secondaryMuscles]);
        setEquipment(ex.equipment);
        setMeasure(ex.measure ?? 'reps');
        setDeltHeads(deltHeadsOf(ex, 'any'));
      }
      setNoteText(note?.text ?? '');
    });
    return () => { cancelled = true; };
  }, [exerciseId]);

  const toggleMulti = (
    list: string[],
    setList: (v: string[]) => void,
    val: string,
  ) => {
    setList(
      list.includes(val) ? list.filter((v) => v !== val) : [...list, val],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const input = { name, primaryMuscles, secondaryMuscles, equipment, measure, deltHeads };
      if (exerciseId) {
        await updateCustomExercise(exerciseId, input);
        await saveNote(exerciseId, noteText);
        onSaved(exerciseId);
      } else {
        const created = await createCustomExercise(input);
        await saveNote(created.id, noteText);
        onSaved(created.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd');
    }
  };

  return (
  <form onSubmit={(e) => void handleSubmit(e)} noValidate>
    {error && (
      <p role="alert" className="form-error">{error}</p>
    )}

    {/* Name */}
    <div className="form-field">
      <label className="form-label" htmlFor="ex-name">Nazwa</label>
      <input
        id="ex-name"
        type="text"
        className="form-input"
        placeholder="np. Wiosło sztangą"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoCapitalize="words"
        autoCorrect="off"
      />
    </div>

    {/* Primary muscles */}
    <div className="form-field">
      <p className="form-label" id="primary-label">Mięśnie główne</p>
      <div className="form-chips" role="group" aria-labelledby="primary-label">
        {(MUSCLES as unknown as string[]).map((m) => (
          <button
            key={m}
            type="button"
            className="form-chip"
            aria-pressed={primaryMuscles.includes(m)}
            onClick={() => toggleMulti(primaryMuscles, setPrimaryMuscles, m)}
          >
            {muscleLabel(m)}
          </button>
        ))}
      </div>
    </div>

    {/* Secondary muscles */}
    <div className="form-field">
      <p className="form-label" id="secondary-label">Mięśnie pomocnicze</p>
      <div className="form-chips" role="group" aria-labelledby="secondary-label">
        {(MUSCLES as unknown as string[]).map((m) => (
          <button
            key={m}
            type="button"
            className="form-chip"
            aria-pressed={secondaryMuscles.includes(m)}
            onClick={() => toggleMulti(secondaryMuscles, setSecondaryMuscles, m)}
          >
            {muscleLabel(m)}
          </button>
        ))}
      </div>
    </div>

    {/* Deltoid heads (optional, only when Barki is chosen) */}
    {(primaryMuscles.includes('shoulders') || secondaryMuscles.includes('shoulders')) && (
      <fieldset className="form-field form-delts">
        <legend className="form-label">Który fragment barków? (opcjonalnie)</legend>
        <div className="form-chips">
          {(['front', 'side', 'rear'] as DeltHead[]).map((h) => (
            <label key={h} className="form-delt">
              <input
                type="checkbox"
                checked={deltHeads.includes(h)}
                onChange={() =>
                  setDeltHeads(deltHeads.includes(h) ? deltHeads.filter((x) => x !== h) : [...deltHeads, h])
                }
              />
              {DELT_LABEL[h]}
            </label>
          ))}
        </div>
      </fieldset>
    )}

    {/* Equipment (single select) */}
    <div className="form-field">
      <p className="form-label" id="equip-label">Sprzęt</p>
      <div className="form-chips" role="group" aria-labelledby="equip-label">
        {/* "Brak" = null */}
        <button
          type="button"
          className="form-chip"
          aria-pressed={equipment === null}
          onClick={() => setEquipment(null)}
        >
          Brak
        </button>
        {(EQUIPMENT as unknown as string[]).map((e) => (
          <button
            key={e}
            type="button"
            className="form-chip"
            aria-pressed={equipment === e}
            onClick={() => setEquipment(e)}
          >
            {equipmentLabel(e)}
          </button>
        ))}
      </div>
    </div>

    {/* Measure */}
    <div className="form-field">
      <label className="form-label" htmlFor="ex-measure">Rodzaj ćwiczenia</label>
      <select
        id="ex-measure"
        className="form-input"
        value={measure}
        onChange={(e) => setMeasure(e.target.value as Measure)}
      >
        {MEASURE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>

    {/* Note */}
    <div className="form-field">
      <label className="form-label" htmlFor="ex-note">Notatka</label>
      <textarea
        id="ex-note"
        className="form-input form-textarea"
        placeholder="Twoje spostrzeżenia…"
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
      />
    </div>

    {/* Actions */}
    <div className="form-actions">
      <button type="submit" className="form-btn form-btn--save">
        Zapisz
      </button>
      <button type="button" className="form-btn form-btn--cancel" onClick={onCancel}>
        Anuluj
      </button>
    </div>
  </form>
  );
}
