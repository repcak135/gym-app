import { useEffect, useState } from 'react';
import { Dumbbell } from 'lucide-react';

import {
  getTips,
  imageUrl,
  loadPolishInstructions,
  pickInstructions,
  type InstructionsPl,
} from '../data/exercises';
import { exerciseMuscleLabels, equipmentLabel, LEVEL_PL } from '../data/exerciseLabels';
import type { Exercise } from '../data/types';
import EquipmentIcon from './EquipmentIcon';
import '../pages/ExerciseDetailPage.css';

// How to do an exercise — photos, muscles, Polish tips, instructions. Shared by the exercise card
// and the in-workout info sheet ("Opis"), so both always show the same thing.

const FRAME_MS = 1600;
const FRAME_LABELS = ['Zdjęcie 1', 'Zdjęcie 2'];

// Both photos (two positions of the movement; upstream order is not always start→end) stacked in one 3:2 frame; they alternate
// like an animation until the user picks one. Both load up front, so both get
// cached for offline use.
export function PhotoStrip({ images }: { images: string[] }) {
  const frames = images.slice(0, 2);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(
    () => frames.length > 1 && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  const [loaded, setLoaded] = useState<boolean[]>(() => frames.map(() => false));
  const [errored, setErrored] = useState<boolean[]>(() => frames.map(() => false));
  const allLoaded = loaded.every(Boolean);

  useEffect(() => {
    if (!playing || !allLoaded) return;
    const timer = setInterval(() => setCurrent((c) => (c + 1) % frames.length), FRAME_MS);
    return () => clearInterval(timer);
  }, [playing, allLoaded, frames.length]);

  if (frames.length === 0) return null;

  const mark = (setter: typeof setLoaded, i: number) =>
    setter((prev) => prev.map((v, j) => (j === i ? true : v)));

  return (
    <div className="detail-photos">
      <div className={`detail-photo-frame${loaded[current] ? '' : ' detail-photo-frame--loading'}`}>
        {frames.map((img, i) =>
          errored[i] ? (
            <div key={i} className="detail-photo detail-photo--placeholder" data-active={i === current} aria-hidden="true">
              <Dumbbell size={48} />
            </div>
          ) : (
            <img
              key={i}
              className="detail-photo"
              data-active={i === current}
              src={imageUrl(img)}
              alt={i === current ? (FRAME_LABELS[i] ?? `Zdjęcie ${i + 1}`) : ''}
              crossOrigin="anonymous"
              decoding="async"
              onLoad={() => mark(setLoaded, i)}
              onError={() => { mark(setErrored, i); mark(setLoaded, i); }}
            />
          ),
        )}
      </div>
      {frames.length > 1 && (
        <div className="detail-photo-switch" role="group" aria-label="Zdjęcia ćwiczenia">
          {frames.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={!playing && i === current}
              data-active={i === current}
              onClick={() => { setPlaying(false); setCurrent(i); }}
            >
              {FRAME_LABELS[i] ?? i + 1}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={playing}
            data-active={playing}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? 'Pauza' : 'Animuj'}
          </button>
        </div>
      )}
    </div>
  );
}

export function NoPhoto({ equipment }: { equipment: string | null }) {
  return (
    <div className="detail-nophoto">
      <EquipmentIcon equipment={equipment} size={44} />
      <span>Brak zdjęcia — opis ruchu niżej</span>
    </div>
  );
}


/** Photos (or the equipment icon when there are none); own exercises have no photos. */
export function ExercisePhotos({ exercise }: { exercise: Exercise }) {
  if (exercise.custom) return null;
  return exercise.images.length > 0 ? <PhotoStrip images={exercise.images} /> : <NoPhoto equipment={exercise.equipment} />;
}

export function ExerciseChips({ exercise }: { exercise: Exercise }) {
  const levelPl = exercise.level ? (LEVEL_PL[exercise.level] ?? exercise.level) : null;
  return (
    <div className="detail-chips">
      {exerciseMuscleLabels(exercise, 'primary').map((l) => (
        <span key={l} className="chip chip--primary">{l}</span>
      ))}
      {exerciseMuscleLabels(exercise, 'secondary').map((l) => (
        <span key={l} className="chip chip--secondary">{l}</span>
      ))}
      {exercise.equipment && <span className="chip chip--equip">{equipmentLabel(exercise.equipment)}</span>}
      {levelPl && <span className="chip chip--equip">{levelPl}</span>}
    </div>
  );
}

export function ExerciseTips({ exerciseId }: { exerciseId: string }) {
  const tips = getTips(exerciseId);
  if (tips.length === 0) return null;
  return (
    <section className="detail-section" aria-label="Rady">
      <p className="detail-section-title">Rady</p>
      <ul className="detail-tips">
        {tips.map((tip, i) => <li key={i}>{tip}</li>)}
      </ul>
    </section>
  );
}

export function ExerciseInstructions({ exercise }: { exercise: Exercise }) {
  const [pl, setPl] = useState<InstructionsPl | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadPolishInstructions().then((v) => { if (!cancelled) setPl(v); });
    return () => { cancelled = true; };
  }, []);
  const steps = pickInstructions(exercise, pl);
  if (steps.length === 0) return null;
  return (
    <section className="detail-section" aria-label="Instrukcja">
      <p className="detail-section-title">Instrukcja</p>
      <ol className="detail-instructions">
        {steps.map((step, i) => <li key={i}>{step}</li>)}
      </ol>
    </section>
  );
}

/** Everything about how to do it, in one block (the in-workout "Opis" tab). */
export default function ExerciseHowTo({ exercise }: { exercise: Exercise }) {
  return (
    <>
      {exercise.namePl && <p className="detail-name-pl">{exercise.namePl}</p>}
      <ExercisePhotos exercise={exercise} />
      <ExerciseChips exercise={exercise} />
      <ExerciseTips exerciseId={exercise.id} />
      <ExerciseInstructions exercise={exercise} />
    </>
  );
}
