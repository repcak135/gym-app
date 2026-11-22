import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import type { Exercise } from '../data/types';
import { imageUrl } from '../data/exercises';

interface ExerciseThumbProps {
  exercise: Exercise;
  size?: number; // px, default 56
}

export default function ExerciseThumb({ exercise, size = 56 }: ExerciseThumbProps) {
  const [errored, setErrored] = useState(false);

  const firstImage = exercise.images[0];

  if (!firstImage || errored) {
    return (
      <span
        className="exercise-thumb exercise-thumb--placeholder"
        style={{ width: size, height: size, minWidth: size }}
        aria-hidden="true"
      >
        <Dumbbell size={size * 0.45} />
      </span>
    );
  }

  return (
    <img
      className="exercise-thumb"
      src={imageUrl(firstImage)}
      alt=""
      width={size}
      height={size}
      crossOrigin="anonymous"
      loading="lazy"
      decoding="async"
      style={{ width: size, height: size, minWidth: size }}
      onError={() => setErrored(true)}
    />
  );
}
