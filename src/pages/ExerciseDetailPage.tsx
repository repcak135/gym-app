import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Pencil, Send, Trash2 } from 'lucide-react';

import { db } from '../data/db';
import RecordsSection from '../components/RecordsSection';
import ExerciseHistorySection from '../components/ExerciseHistorySection';
import ConfirmSheet from '../components/ConfirmSheet';
import NoteEditor from '../components/NoteEditor';
import { ExerciseChips, ExerciseInstructions, ExercisePhotos, ExerciseTips } from '../components/ExerciseHowTo';
import { MEASURE_OPTIONS, measureOf } from '../data/measure';
import type { Exercise, Measure } from '../data/types';
import { removeCustomExerciseUndoable } from '../data/undoable';
import { showUndo } from '../undo';
import './ExerciseDetailPage.css';
import '../components/Sheet.css';

/** Built-in exercise: the choice is kept as measureOverride; picking the built-in default clears it. */
async function saveMeasure(exercise: Exercise, value: Measure): Promise<void> {
  if (value === (exercise.measure ?? 'reps')) {
    await db.exercises.update(exercise.id, { measureOverride: undefined });
  } else {
    await db.exercises.update(exercise.id, { measureOverride: value });
  }
}

export default function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const exerciseId = decodeURIComponent(id ?? '');

  const exercise = useLiveQuery(
    () => (exerciseId ? db.exercises.get(exerciseId) : undefined),
    [exerciseId],
  );
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState<string | null>(null);

  const handleDelete = async () => {
    setShowConfirm(false);
    const result = await removeCustomExerciseUndoable(exerciseId);
    if (result.ok) {
      showUndo(`Usunięto ćwiczenie „${exercise?.name ?? ''}”`, result.restore);
      navigate('/cwiczenia', { replace: true });
    } else {
      setDeleteReason(result.reason);
    }
  };

  // exercise === undefined means loading; null-ish means 404
  if (exercise === undefined) {
    return (
      <article>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 'var(--space-6)' }}>Ładowanie…</p>
      </article>
    );
  }

  if (!exercise) {
    return (
      <article>
        <div className="detail-not-found">
          <p>Nie znaleziono ćwiczenia.</p>
          <Link to="/cwiczenia" className="detail-btn detail-btn--edit">
            Wróć do listy
          </Link>
        </div>
      </article>
    );
  }

  return (
    <article>
      {/* Back */}
      <Link to="/cwiczenia" className="detail-back" aria-label="Wróć do listy ćwiczeń">
        <ArrowLeft size={18} aria-hidden="true" />
        Wróć
      </Link>

      {/* Title row */}
      <div className="detail-title-row">
        <h1>{exercise.name}</h1>
        {exercise.custom && <span className="badge-custom">Własne</span>}
      </div>
      {exercise.namePl && <p className="detail-name-pl">{exercise.namePl}</p>}

      <ExercisePhotos exercise={exercise} />
      <ExerciseChips exercise={exercise} />
      <ExerciseTips exerciseId={exercise.id} />

      {!exercise.custom && (
        <section className="detail-section">
          <label className="detail-section-title" htmlFor="ex-measure">Rodzaj ćwiczenia</label>
          <select
            id="ex-measure"
            className="detail-select"
            value={measureOf(exercise)}
            onChange={(e) => void saveMeasure(exercise, e.target.value as Measure)}
          >
            {MEASURE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </section>
      )}

      <RecordsSection exerciseId={exercise.id} />

      <section className="detail-section" aria-label="Twoja notatka">
        <p className="detail-section-title">Twoja notatka</p>
        <NoteEditor exerciseId={exercise.id} className="detail-note-textarea" />
      </section>

      <ExerciseHistorySection exerciseId={exercise.id} />

      <ExerciseInstructions exercise={exercise} />

      {/* Custom exercise actions */}
      {exercise.custom && (
        <div className="detail-actions">
          <Link
            to={`/cwiczenia/${encodeURIComponent(exercise.id)}/edytuj`}
            className="detail-btn detail-btn--edit"
          >
            <Pencil size={16} aria-hidden="true" />
            Edytuj
          </Link>
          <Link
            to={`/cwiczenia/${encodeURIComponent(exercise.id)}/wyslij`}
            className="detail-btn detail-btn--edit"
          >
            <Send size={16} aria-hidden="true" />
            Wyślij ćwiczenie
          </Link>
          <button
            type="button"
            className="detail-btn detail-btn--delete"
            onClick={() => { setDeleteReason(null); setShowConfirm(true); }}
          >
            <Trash2 size={16} aria-hidden="true" />
            Usuń
          </button>
        </div>
      )}

      {/* Delete reason */}
      {deleteReason && (
        <p className="detail-delete-reason" role="alert">{deleteReason}</p>
      )}

      {/* Confirm delete sheet */}
      {showConfirm && (
        <ConfirmSheet
          title="Usunąć ćwiczenie?"
          onConfirm={() => void handleDelete()}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </article>
  );
}
