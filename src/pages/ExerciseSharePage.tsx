import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';

import { db } from '../data/db';
import { MAX_SHARED_EXERCISES, encodeExercises, exercisesShareUrl } from '../data/exerciseShare';
import ShareLinkPanel from '../components/ShareLinkPanel';
import './PlansPage.css';
import './PlanSharePage.css';

/** Share one custom exercise (/cwiczenia/:id/wyslij) or all of them (/cwiczenia/wyslij). */
export default function ExerciseSharePage() {
  const { id } = useParams<{ id: string }>();
  const exerciseId = id ? decodeURIComponent(id) : null;
  const list = useLiveQuery(async () => {
    if (exerciseId) {
      const ex = await db.exercises.get(exerciseId);
      return ex?.custom ? [ex] : [];
    }
    return (await db.exercises.filter((e) => e.custom).toArray()).sort((a, b) =>
      a.name.localeCompare(b.name, 'pl'),
    );
  }, [exerciseId]);

  const shown = useMemo(() => (list ?? []).slice(0, MAX_SHARED_EXERCISES), [list]);
  const url = useMemo(() => (shown.length > 0 ? exercisesShareUrl(encodeExercises(shown)) : ''), [shown]);

  const backTo = exerciseId ? `/cwiczenia/${encodeURIComponent(exerciseId)}` : '/cwiczenia?t=moje';

  if (list === undefined) return <article><p className="plan-muted">Ładowanie…</p></article>;
  if (list.length === 0) {
    return (
      <article>
        <p>{exerciseId ? 'Nie znaleziono własnego ćwiczenia.' : 'Nie masz jeszcze własnych ćwiczeń.'}</p>
        <Link to="/cwiczenia" className="plan-btn">Wróć do ćwiczeń</Link>
      </article>
    );
  }

  const title = exerciseId ? shown[0].name : 'Moje ćwiczenia';

  return (
    <article className="pshare">
      <Link to={backTo} className="plan-back" aria-label="Wróć">
        <ArrowLeft size={18} aria-hidden="true" />
        {exerciseId ? title : 'Ćwiczenia'}
      </Link>
      <h1>{exerciseId ? 'Wyślij ćwiczenie' : 'Wyślij moje ćwiczenia'}</h1>
      <p className="plan-muted">
        Znajomy skanuje kod w aplikacji: Plany → Skanuj kod QR (albo Ćwiczenia → Moje → Skanuj kod QR).
        Dodaje się u niego jako jego własne ćwiczenie — bez Twojej notatki.
      </p>
      {!exerciseId && (
        <p className="plan-muted">
          Ćwiczeń: {shown.length}
          {list.length > shown.length && ` (wysyłam pierwsze ${MAX_SHARED_EXERCISES} z ${list.length})`}
        </p>
      )}

      <ShareLinkPanel
        url={url}
        shareTitle={title}
        shareText={`Ćwiczenia: ${title}`}
        qrLabel="Kod QR ćwiczeń"
        tooLongText="Za dużo danych na kod QR — wyślij link."
        linkLabel="Link do ćwiczeń"
      />
    </article>
  );
}
