import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, MoreHorizontal } from 'lucide-react';

import { db } from '../data/db';
import { createPlan, renamePlan, copyPlan, deletePlan, setActivePlan } from '../data/plans';
import type { Plan } from '../data/types';
import NameSheet from '../components/NameSheet';
import ConfirmSheet from '../components/ConfirmSheet';
import { formatDate, daysLabel } from './planFormat';
import '../components/Sheet.css';
import './ExercisesPage.css';
import './PlansPage.css';

type Modal =
  | { kind: 'new' }
  | { kind: 'options'; plan: Plan }
  | { kind: 'rename'; plan: Plan }
  | { kind: 'delete'; plan: Plan }
  | null;

export default function PlansPage() {
  const navigate = useNavigate();
  const plans = useLiveQuery(() => db.plans.toArray(), []);
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  const [modal, setModal] = useState<Modal>(null);

  const activeId = settings?.activePlanId;
  const sorted = plans ? [...plans].sort((a, b) => a.name.localeCompare(b.name, 'pl')) : [];

  return (
    <article>
      <div className="exercises-header">
        <h1>Plany</h1>
        <button
          type="button"
          aria-label="Nowy plan"
          className="exercises-add-btn"
          onClick={() => setModal({ kind: 'new' })}
        >
          <Plus size={22} aria-hidden="true" />
        </button>
      </div>

      {plans && sorted.length === 0 && (
        <div className="plans-empty">
          <p>Nie masz jeszcze planu.</p>
          <button type="button" className="plan-btn plan-btn--primary" onClick={() => setModal({ kind: 'new' })}>
            Utwórz plan
          </button>
        </div>
      )}

      <div className="plan-list">
        {sorted.map((plan) => (
          <div key={plan.id} className="plan-card">
            <Link to={`/plany/${plan.id}`} className="plan-card__link" aria-label={plan.name}>
              <span className="plan-card__name">
                {plan.name}
                {plan.id === activeId && <span className="badge-custom">Aktywny</span>}
              </span>
              <span className="plan-card__meta">
                Start: {formatDate(plan.startedAt)} · {daysLabel(plan.days.length)}
              </span>
            </Link>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Opcje planu ${plan.name}`}
              onClick={() => setModal({ kind: 'options', plan })}
            >
              <MoreHorizontal size={22} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      {modal?.kind === 'new' && (
        <NameSheet
          title="Nowy plan"
          onCancel={() => setModal(null)}
          onSave={async (name) => {
            const plan = await createPlan(name);
            setModal(null);
            navigate(`/plany/${plan.id}`);
          }}
        />
      )}

      {modal?.kind === 'options' && (
        <div
          className="sheet-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setModal(null); }}
        >
          <div role="dialog" aria-label="Opcje planu" aria-modal="true" className="sheet">
            <div className="sheet__handle" aria-hidden="true" />
            <p className="sheet__title">{modal.plan.name}</p>
            <div className="sheet__list">
              {modal.plan.id !== activeId && (
                <button
                  type="button"
                  className="sheet__option"
                  onClick={() => { void setActivePlan(modal.plan.id); setModal(null); }}
                >
                  Ustaw jako aktywny
                </button>
              )}
              <button type="button" className="sheet__option" onClick={() => setModal({ kind: 'rename', plan: modal.plan })}>
                Zmień nazwę
              </button>
              <button
                type="button"
                className="sheet__option"
                onClick={() => { void copyPlan(modal.plan.id); setModal(null); }}
              >
                Kopiuj
              </button>
              <button
                type="button"
                className="sheet__option plan-option--danger"
                onClick={() => setModal({ kind: 'delete', plan: modal.plan })}
              >
                Usuń
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.kind === 'rename' && (
        <NameSheet
          title="Zmień nazwę"
          initialValue={modal.plan.name}
          onCancel={() => setModal(null)}
          onSave={async (name) => {
            await renamePlan(modal.plan.id, name);
            setModal(null);
          }}
        />
      )}

      {modal?.kind === 'delete' && (
        <ConfirmSheet
          title="Usunąć plan?"
          onCancel={() => setModal(null)}
          onConfirm={() => { void deletePlan(modal.plan.id); setModal(null); }}
        />
      )}
    </article>
  );
}
