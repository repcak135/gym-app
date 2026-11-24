import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';

import { db } from '../data/db';
import { encodePlan, shareUrl } from '../data/planShare';
import type { Exercise } from '../data/types';
import ShareLinkPanel from '../components/ShareLinkPanel';
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

      <ShareLinkPanel
        url={url}
        shareTitle={plan.name}
        shareText={`Plan treningowy: ${plan.name}`}
        qrLabel="Kod QR planu"
        tooLongText="Plan jest za duży na kod QR — wyślij link."
        linkLabel="Link do planu"
      />
    </article>
  );
}
