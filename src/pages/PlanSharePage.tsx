import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Share2, Copy } from 'lucide-react';

import { db } from '../data/db';
import { encodePlan, qrFits, shareUrl } from '../data/planShare';
import type { Exercise } from '../data/types';
import QrCode from '../components/QrCode';
import './PlansPage.css';
import './PlanSharePage.css';

export default function PlanSharePage() {
  const { planId = '' } = useParams<{ planId: string }>();
  const data = useLiveQuery(async () => {
    const plan = await db.plans.get(planId);
    if (!plan) return null;
    const ids = [...new Set(plan.days.flatMap((d) => d.items.map((it) => it.exerciseId)))];
    const list = await db.exercises.bulkGet(ids);
    const exercises = new Map<string, Exercise>();
    for (const e of list) if (e) exercises.set(e.id, e);
    return { plan, exercises };
  }, [planId]);
  const [status, setStatus] = useState<string | null>(null);

  const url = useMemo(() => (data ? shareUrl(encodePlan(data.plan, data.exercises)) : ''), [data]);

  if (data === undefined) return <article><p className="plan-muted">Ładowanie…</p></article>;
  if (data === null) {
    return (
      <article>
        <p>Nie znaleziono planu</p>
        <Link to="/plany" className="plan-btn">Wróć do planów</Link>
      </article>
    );
  }

  const { plan } = data;
  const canShare = typeof navigator.share === 'function';

  const share = async () => {
    try {
      await navigator.share({ title: plan.name, text: `Plan treningowy: ${plan.name}`, url });
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
      <Link to={`/plany/${plan.id}`} className="plan-back" aria-label="Wróć do planu">
        <ArrowLeft size={18} aria-hidden="true" />
        {plan.name}
      </Link>
      <h1>Wyślij plan</h1>
      <p className="plan-muted">
        Znajomy skanuje kod w aplikacji: Plany → Skanuj kod QR (albo otwiera link). Plan dodaje się u niego jako osobna kopia —
        jego zmiany nie wpływają na Twój plan.
      </p>

      {plan.days.length === 0 && <p className="plan-muted">Ten plan nie ma jeszcze dni.</p>}

      <div className="pshare__qr">
        {qrFits(url) ? (
          <QrCode text={url} label="Kod QR planu" />
        ) : (
          <p className="pshare__toolong" role="note">
            Plan jest za duży na kod QR — wyślij link.
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
        Link do planu
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
