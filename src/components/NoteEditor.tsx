import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../data/db';
import { saveNote } from '../data/exercises';

const DEBOUNCE_MS = 400;

/**
 * The owner's note for one exercise — the same editor on the exercise card and in the workout
 * info sheet: saves 0.4 s after typing stops, on blur and when closed, and says "Zapisano".
 */
export default function NoteEditor({ exerciseId, className }: { exerciseId: string; className: string }) {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const latest = useRef('');
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void db.notes.get(exerciseId).then((row) => {
      if (cancelled || dirty.current) return;
      latest.current = row?.text ?? '';
      setText(latest.current);
    });
    return () => { cancelled = true; };
  }, [exerciseId]);

  const persist = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!dirty.current) return;
    dirty.current = false;
    await saveNote(exerciseId, latest.current);
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2000);
  }, [exerciseId]);

  // Flush a pending save when the card or sheet closes.
  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (dirty.current) void saveNote(exerciseId, latest.current);
  }, [exerciseId]);

  if (text === null) return null;
  return (
    <>
      <textarea
        className={className}
        aria-label="Notatka do ćwiczenia"
        placeholder="Np. ławka na 3, łokcie bliżej ciała…"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
          latest.current = e.target.value;
          dirty.current = true;
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => void persist(), DEBOUNCE_MS);
        }}
        onBlur={() => void persist()}
      />
      <p className="detail-note-saved" aria-live="polite">{saved ? 'Zapisano' : ''}</p>
    </>
  );
}
