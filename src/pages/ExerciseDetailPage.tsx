import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Dumbbell, Pencil, Trash2 } from 'lucide-react';

import { db } from '../data/db';
import {
  getTips,
  saveNote,
  deleteCustomExercise,
  imageUrl,
} from '../data/exercises';
import {
  muscleLabel,
  equipmentLabel,
  LEVEL_PL,
} from '../data/exerciseLabels';
import './ExerciseDetailPage.css';
import '../components/Sheet.css';

const DEBOUNCE_MS = 400;

function PhotoStrip({ images }: { images: string[] }) {
  const [errored, setErrored] = useState<Set<number>>(new Set());

  const markError = (i: number) =>
    setErrored((prev) => new Set(prev).add(i));

  if (images.length === 0) return null;

  return (
    <div className="detail-photos" aria-label="Zdjęcia ćwiczenia">
      {images.map((img, i) =>
        errored.has(i) ? (
          <div key={i} className="detail-photo-placeholder" aria-hidden="true">
            <Dumbbell size={48} />
          </div>
        ) : (
          <img
            key={i}
            className="detail-photo"
            src={imageUrl(img)}
            alt=""
            crossOrigin="anonymous"
            loading="lazy"
            decoding="async"
            onError={() => markError(i)}
          />
        ),
      )}
    </div>
  );
}

interface ConfirmSheetProps {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmSheet({ title, onConfirm, onCancel }: ConfirmSheetProps) {
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onCancel();
  };
  return (
    <div
      className="sheet-backdrop"
      onClick={handleBackdrop}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <div
        role="dialog"
        aria-label={title}
        aria-modal="true"
        className="sheet"
      >
        <div className="sheet__handle" aria-hidden="true" />
        <div className="confirm-sheet__body">
          <p className="confirm-sheet__title">{title}</p>
          <div className="confirm-sheet__actions">
            <button
              type="button"
              className="confirm-sheet__btn confirm-sheet__btn--danger"
              onClick={onConfirm}
            >
              Usuń
            </button>
            <button
              type="button"
              className="confirm-sheet__btn confirm-sheet__btn--cancel"
              onClick={onCancel}
            >
              Anuluj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const exerciseId = decodeURIComponent(id ?? '');

  const exercise = useLiveQuery(
    () => (exerciseId ? db.exercises.get(exerciseId) : undefined),
    [exerciseId],
  );
  const [noteText, setNoteText] = useState('');
  const [saved, setSaved] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState<string | null>(null);

  // Latest typed text and pending save, kept in refs so unmount can flush them.
  const latestText = useRef('');
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the note once per exercise.
  useEffect(() => {
    let cancelled = false;
    void db.notes.get(exerciseId).then((row) => {
      if (cancelled || dirty.current) return;
      latestText.current = row?.text ?? '';
      setNoteText(latestText.current);
    });
    return () => { cancelled = true; };
  }, [exerciseId]);

  const persistNote = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!dirty.current) return;
    dirty.current = false;
    await saveNote(exerciseId, latestText.current);
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2000);
  }, [exerciseId]);

  const handleNoteChange = (text: string) => {
    setNoteText(text);
    setSaved(false);
    latestText.current = text;
    dirty.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persistNote(), DEBOUNCE_MS);
  };

  const handleNoteBlur = () => void persistNote();

  // Flush a pending save when leaving the page.
  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (dirty.current) void saveNote(exerciseId, latestText.current);
  }, [exerciseId]);

  const handleDelete = async () => {
    setShowConfirm(false);
    const result = await deleteCustomExercise(exerciseId);
    if (result.ok) {
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

  const tips = getTips(exercise.id);
  const levelPl = exercise.level ? (LEVEL_PL[exercise.level] ?? exercise.level) : null;

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

      {/* Photos (non-custom only) */}
      {!exercise.custom && exercise.images.length > 0 && (
        <PhotoStrip images={exercise.images} />
      )}

      {/* Chips: muscles + equipment + level */}
      <div className="detail-chips">
        {exercise.primaryMuscles.map((m) => (
          <span key={m} className="chip chip--primary">{muscleLabel(m)}</span>
        ))}
        {exercise.secondaryMuscles.map((m) => (
          <span key={m} className="chip chip--secondary">{muscleLabel(m)}</span>
        ))}
        {exercise.equipment && (
          <span className="chip chip--equip">{equipmentLabel(exercise.equipment)}</span>
        )}
        {levelPl && (
          <span className="chip chip--equip">{levelPl}</span>
        )}
      </div>

      {/* Tips */}
      {tips.length > 0 && (
        <section className="detail-section" aria-label="Rady">
          <p className="detail-section-title">Rady</p>
          <ul className="detail-tips">
            {tips.map((tip, i) => <li key={i}>{tip}</li>)}
          </ul>
        </section>
      )}

      {/* Note */}
      <section className="detail-section" aria-label="Twoja notatka">
        <p className="detail-section-title">Twoja notatka</p>
        <textarea
          className="detail-note-textarea"
          aria-label="Notatka"
          placeholder="Twoje spostrzeżenia, komentarze…"
          value={noteText}
          onChange={(e) => handleNoteChange(e.target.value)}
          onBlur={handleNoteBlur}
        />
        <p className="detail-note-saved" aria-live="polite">
          {saved ? 'Zapisano' : ''}
        </p>
      </section>

      {/* Instructions */}
      {exercise.instructions.length > 0 && (
        <section className="detail-section" aria-label="Instrukcja">
          <p className="detail-section-title">Instrukcja</p>
          <ol className="detail-instructions">
            {exercise.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      )}

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
