import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ChevronRight } from 'lucide-react';

import { db } from '../data/db';
import { formatReps, formatTarget, setActivePlan } from '../data/plans';
import { PLAN_TEMPLATES, TEMPLATE_CREDIT, createPlanFromTemplate, type PlanTemplate, type TemplateItem } from '../data/templates';
import { daysLabel, exercisesLabel } from '../data/plural';
import './PlansPage.css';
import './PlanTemplatesPage.css';

const countItems = (t: PlanTemplate) => t.days.reduce((n, d) => n + d.items.length, 0);

const itemLine = (it: TemplateItem) =>
  it.targetSec ? formatTarget(it, 'time') : `${it.sets} × ${formatReps(it)}`;

export default function PlanTemplatesPage() {
  const navigate = useNavigate();
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const nameOf = useMemo(
    () => new Map((exercises ?? []).map((e) => [e.id, e.namePl ?? e.name])),
    [exercises],
  );

  const template = PLAN_TEMPLATES.find((t) => t.id === openId);

  const add = async (t: PlanTemplate) => {
    setSaving(true);
    setError('');
    try {
      const plan = await createPlanFromTemplate(t.id);
      const settings = await db.settings.get('app');
      if (!settings?.activePlanId) await setActivePlan(plan.id);
      navigate(`/plany/${plan.id}`);
    } catch {
      setError('Nie udało się dodać planu.');
      setSaving(false);
    }
  };

  const back = (
    <button
      type="button"
      className="plan-back tpl-back"
      onClick={() => (template ? setOpenId(null) : navigate('/plany'))}
    >
      <ArrowLeft size={18} aria-hidden="true" />
      {template ? 'Szablony' : 'Plany'}
    </button>
  );

  if (template) {
    return (
      <article className="tpl">
        {back}
        <h1>{template.name}</h1>
        <div className="tpl-desc">
          {template.description.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        {template.days.map((day) => (
          <section key={day.name} className="tpl-day">
            <h2>{day.name}</h2>
            <p className="muted tpl-day__note">{day.note}</p>
            <ul className="tpl-items">
              {day.items.map((it, i) => (
                <li key={i}>
                  <span>{nameOf.get(it.exerciseId) ?? it.exerciseId.replace(/_/g, ' ')}</span>
                  <span className="muted">{itemLine(it)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="tpl-credit">{TEMPLATE_CREDIT}</p>
        {error && <p className="imp-error" role="alert">{error}</p>}
        <button
          type="button"
          className="plan-btn plan-btn--primary plan-btn--block"
          disabled={saving}
          onClick={() => void add(template)}
        >
          Dodaj ten plan
        </button>
      </article>
    );
  }

  return (
    <article className="tpl">
      {back}
      <h1>Szablony planów</h1>
      <p className="muted">Gotowe plany do wyboru. Po dodaniu to zwykły plan, który możesz zmieniać.</p>
      <div className="plan-list">
        {PLAN_TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="plan-card tpl-card" onClick={() => setOpenId(t.id)}>
            <span className="tpl-card__text">
              <span className="plan-card__name">{t.name}</span>
              <span className="tpl-card__tagline">{t.tagline}</span>
              <span className="plan-card__meta">
                {daysLabel(t.days.length)} · {exercisesLabel(countItems(t))}
              </span>
            </span>
            <ChevronRight size={20} aria-hidden="true" className="tpl-card__chev" />
          </button>
        ))}
      </div>
    </article>
  );
}
