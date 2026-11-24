import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Share2, Copy } from 'lucide-react';

import { db } from '../data/db';
import { MAX_SHARED_EXERCISES, encodeExercises, exercisesShareUrl } from '../data/exerciseShare';
import { qrFits } from '../data/planShare';
import QrCode from '../components/QrCode';
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
  const [status, setStatus] = useState<string | null>(null);

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
  const canShare = typeof navigator.share === 'function';

  const share = async () => {
    try {
      await navigator.share({ title, text: `Ćwiczenia: ${title}`, url });
      setStatus(null);
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setStatus('Nie udało się otworzyć udostępniania — skopiuj link.');
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Skopiowano link');
    } catch {
      setStatus('Nie udało się skopiować — zaznacz link poniżej i skopiuj go ręcznie.');
    }
  };

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

      <div className="pshare__qr">
        {qrFits(url) ? (
          <QrCode text={url} label="Kod QR ćwiczeń" />
        ) : (
          <p className="pshare__toolong" role="note">
            Za dużo danych na kod QR — wyślij link.
          </p>
        )}
      </div>

      <div className="pshare__actions">
        {canShare && (
          <button type="button" className="plan-btn plan-btn--primary plan-btn--block" onClick={() => void share()}>
            <Share2 size={18} aria-hidden="true" /> Udostępnij link
          </button>
        )}
        <button type="button" className="plan-btn plan-btn--block" onClick={() => void copy()}>
          <Copy size={18} aria-hidden="true" /> Kopiuj link
        </button>
      </div>
      {status && <p className="pshare__status" role="status">{status}</p>}

      <label className="pshare__label">
        Link do ćwiczeń
        <textarea
          className="pshare__link"
          readOnly
          rows={3}
          value={url}
          onFocus={(e) => e.target.select()}
        />
      </label>
    </article>
  );
}
