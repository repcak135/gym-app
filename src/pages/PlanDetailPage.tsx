import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Pencil, ChevronUp, ChevronDown, MoreHorizontal, Send, Play } from 'lucide-react';

import { db } from '../data/db';
import { renamePlan, setActivePlan, addDay, renameDay, moveDay } from '../data/plans';
import { removeDayUndoable } from '../data/undoable';
import { showUndo } from '../undo';
import SwipeRow from '../components/SwipeRow';
import type { PlanDay } from '../data/types';
import NameSheet from '../components/NameSheet';
import ConfirmSheet from '../components/ConfirmSheet';
import { useStartDay } from '../components/useStartDay';
import { formatDate, exercisesLabel } from './planFormat';
import '../components/Sheet.css';
import './ExercisesPage.css';
import './PlansPage.css';

type Modal =
  | { kind: 'renamePlan' }
  | { kind: 'newDay' }
  | { kind: 'dayOptions'; day: PlanDay }
  | { kind: 'renameDay'; day: PlanDay }
  | { kind: 'deleteDay'; day: PlanDay }
  | null;

export default function PlanDetailPage() {
  const { planId = '' } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  // null = loaded but missing
  const plan = useLiveQuery(async () => (await db.plans.get(planId)) ?? null, [planId]);
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  const [modal, setModal] = useState<Modal>(null);
  const { start, sheet: startSheet } = useStartDay();

  if (plan === undefined) {
    return <article><p className="plan-muted">Ładowanie…</p></article>;
  }

  if (plan === null) {
    return (
      <article>
        <p>Nie znaleziono planu</p>
        <Link to="/plany" className="plan-btn">Wróć do planów</Link>
      </article>
    );
  }

  const isActive = settings?.activePlanId === plan.id;

  const removeDay = async (day: PlanDay) => {
    const restore = await removeDayUndoable(plan.id, day.id);
    showUndo(`Usunięto dzień „${day.name}”`, restore);
  };

  return (
    <article>
      <Link to="/plany" className="plan-back" aria-label="Wróć do planów">
        <ArrowLeft size={18} aria-hidden="true" />
        Plany
      </Link>

      <div className="plan-title-row">
        <h1>{plan.name}</h1>
        <button
          type="button"
          className="icon-btn"
          aria-label="Zmień nazwę planu"
          onClick={() => setModal({ kind: 'renamePlan' })}
        >
          <Pencil size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="plan-sub">
        <span>Start: {formatDate(plan.startedAt)}</span>
        {isActive ? (
          <span className="badge-custom">Aktywny</span>
        ) : (
          <button type="button" className="plan-btn" onClick={() => void setActivePlan(plan.id)}>
            Ustaw jako aktywny
          </button>
        )}
      </div>

      <div className="plan-list list-in">
        {plan.days.map((day, i) => (
          <SwipeRow key={day.id} label={day.name} onDelete={() => removeDay(day)} index={i}>
          <div className="day-row">
            <Link to={`/plany/${plan.id}/dni/${day.id}`} className="day-row__link" aria-label={day.name}>
              <span className="day-row__name">{day.name}</span>
              <span className="day-row__meta">{exercisesLabel(day.items.length)}</span>
            </Link>
            <button
              type="button"
              className="day-row__start"
              aria-label={`Rozpocznij trening: ${day.name}`}
              disabled={day.items.length === 0}
              onClick={() => start(plan.id, day.id)}
            >
              <Play size={18} aria-hidden="true" fill="currentColor" />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Przesuń w górę: ${day.name}`}
              disabled={i === 0}
              onClick={() => void moveDay(plan.id, day.id, -1)}
            >
              <ChevronUp size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Przesuń w dół: ${day.name}`}
              disabled={i === plan.days.length - 1}
              onClick={() => void moveDay(plan.id, day.id, 1)}
            >
              <ChevronDown size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Opcje dnia ${day.name}`}
              onClick={() => setModal({ kind: 'dayOptions', day })}
            >
              <MoreHorizontal size={22} aria-hidden="true" />
            </button>
          </div>
          </SwipeRow>
        ))}
      </div>

      <button
        type="button"
        className="plan-btn plan-btn--block plan-add-day"
        onClick={() => setModal({ kind: 'newDay' })}
      >
        Dodaj dzień
      </button>

      <Link to={`/plany/${plan.id}/wyslij`} className="plan-btn plan-btn--block plan-share-link">
        <Send size={18} aria-hidden="true" />
        Wyślij plan
      </Link>

      {startSheet}

      {modal?.kind === 'renamePlan' && (
        <NameSheet
          title="Zmień nazwę"
          initialValue={plan.name}
          onCancel={() => setModal(null)}
          onSave={async (name) => {
            await renamePlan(plan.id, name);
            setModal(null);
          }}
        />
      )}

      {modal?.kind === 'newDay' && (
        <NameSheet
          title="Nowy dzień"
          initialValue={`Day ${plan.days.length + 1} `}
          onCancel={() => setModal(null)}
          onSave={async (name) => {
            const day = await addDay(plan.id, name);
            setModal(null);
            navigate(`/plany/${plan.id}/dni/${day.id}`);
          }}
        />
      )}

      {modal?.kind === 'dayOptions' && (
        <div
          className="sheet-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setModal(null); }}
        >
          <div role="dialog" aria-label="Opcje dnia" aria-modal="true" className="sheet">
            <div className="sheet__handle" aria-hidden="true" />
            <p className="sheet__title">{modal.day.name}</p>
            <div className="sheet__list">
              <button type="button" className="sheet__option" onClick={() => setModal({ kind: 'renameDay', day: modal.day })}>
                Zmień nazwę
              </button>
              <button
                type="button"
                className="sheet__option plan-option--danger"
                onClick={() => setModal({ kind: 'deleteDay', day: modal.day })}
              >
                Usuń
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.kind === 'renameDay' && (
        <NameSheet
          title="Zmień nazwę"
          initialValue={modal.day.name}
          onCancel={() => setModal(null)}
          onSave={async (name) => {
            await renameDay(plan.id, modal.day.id, name);
            setModal(null);
          }}
        />
      )}

      {modal?.kind === 'deleteDay' && (
        <ConfirmSheet
          title="Usunąć dzień?"
          onCancel={() => setModal(null)}
          onConfirm={() => { void removeDay(modal.day); setModal(null); }}
        />
      )}
    </article>
  );
}
