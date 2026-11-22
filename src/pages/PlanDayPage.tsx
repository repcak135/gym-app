import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Pencil, ChevronUp, ChevronDown, Trash2, Minus, Plus } from 'lucide-react';

import { db } from '../data/db';
import {
  REST_OPTIONS,
  formatRest,
  renameDay,
  addItems,
  updateItem,
  moveItem,
  removeItem,
} from '../data/plans';
import type { Exercise, PlanItem } from '../data/types';
import ExerciseThumb from '../components/ExerciseThumb';
import ExercisePicker from '../components/ExercisePicker';
import NameSheet from '../components/NameSheet';
import { exercisesLabel } from './planFormat';
import '../components/Sheet.css';
import './ExercisesPage.css';
import './PlansPage.css';
import './PlanDayPage.css';

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="item-field">
      <span className="item-field__label">{label}</span>
      <div className="stepper">
        <button type="button" className="stepper__btn" aria-label={`${label}: mniej`} onClick={() => onChange(value - 1)}>
          <Minus size={18} aria-hidden="true" />
        </button>
        <output className="stepper__value" aria-label={label}>{value}</output>
        <button type="button" className="stepper__btn" aria-label={`${label}: więcej`} onClick={() => onChange(value + 1)}>
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function RepsFields({ item, onSave }: { item: PlanItem; onSave: (p: Partial<Omit<PlanItem, 'exerciseId'>>) => void }) {
  const [minText, setMinText] = useState(String(item.repsMin));
  const [maxText, setMaxText] = useState(String(item.repsMax));

  const save = () => {
    const min = parseInt(minText, 10);
    const max = parseInt(maxText, 10);
    const next: Partial<Omit<PlanItem, 'exerciseId'>> = {};
    if (Number.isFinite(min)) next.repsMin = min;
    if (Number.isFinite(max)) next.repsMax = max;
    // Show the stored (clamped) values again; the parent re-keys us if they changed.
    setMinText(String(item.repsMin));
    setMaxText(String(item.repsMax));
    if (Object.keys(next).length > 0) onSave(next);
  };

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  return (
    <div className="item-field">
      <span className="item-field__label">Powtórzenia</span>
      <div className="reps">
        <input
          type="text"
          inputMode="numeric"
          className="item-input"
          aria-label="Powtórzenia od"
          value={minText}
          onChange={(e) => setMinText(e.target.value)}
          onBlur={save}
          onKeyDown={onEnter}
        />
        <span aria-hidden="true">–</span>
        <input
          type="text"
          inputMode="numeric"
          className="item-input"
          aria-label="Powtórzenia do"
          value={maxText}
          onChange={(e) => setMaxText(e.target.value)}
          onBlur={save}
          onKeyDown={onEnter}
        />
      </div>
    </div>
  );
}

interface ItemCardProps {
  planId: string;
  dayId: string;
  index: number;
  count: number;
  item: PlanItem;
  exercise: Exercise | undefined;
}

function ItemCard({ planId, dayId, index, count, item, exercise }: ItemCardProps) {
  const name = exercise?.name ?? 'Nieznane ćwiczenie';
  const patch = (p: Partial<Omit<PlanItem, 'exerciseId'>>) => void updateItem(planId, dayId, index, p);

  const restOptions = REST_OPTIONS.includes(item.restSec)
    ? REST_OPTIONS
    : [...REST_OPTIONS, item.restSec].sort((a, b) => a - b);

  return (
    <section className="item-card" aria-label={name}>
      <div className="item-card__head">
        <span className="item-card__num">{index + 1}.</span>
        {exercise ? (
          <ExerciseThumb exercise={exercise} size={44} />
        ) : (
          <span className="exercise-thumb exercise-thumb--placeholder" style={{ width: 44, height: 44, minWidth: 44 }} aria-hidden="true" />
        )}
        <span className="item-card__name">{name}</span>
      </div>

      <div className="item-card__grid">
        <Stepper label="Serie" value={item.sets} onChange={(v) => patch({ sets: v })} />
        <Stepper label="Rozgrzewka" value={item.warmupSets} onChange={(v) => patch({ warmupSets: v })} />

        <RepsFields key={`${item.repsMin}-${item.repsMax}`} item={item} onSave={patch} />

        <div className="item-field">
          <span className="item-field__label">Przerwa</span>
          <select
            className="item-input item-select"
            aria-label="Przerwa"
            value={item.restSec}
            onChange={(e) => patch({ restSec: Number(e.target.value) })}
          >
            {restOptions.map((s) => (
              <option key={s} value={s}>{formatRest(s)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="item-card__actions">
        <button
          type="button"
          className="icon-btn"
          aria-label={`Przesuń w górę: ${name}`}
          disabled={index === 0}
          onClick={() => void moveItem(planId, dayId, index, index - 1)}
        >
          <ChevronUp size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Przesuń w dół: ${name}`}
          disabled={index === count - 1}
          onClick={() => void moveItem(planId, dayId, index, index + 1)}
        >
          <ChevronDown size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--danger"
          aria-label={`Usuń: ${name}`}
          onClick={() => void removeItem(planId, dayId, index)}
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

export default function PlanDayPage() {
  const { planId = '', dayId = '' } = useParams<{ planId: string; dayId: string }>();
  const plan = useLiveQuery(async () => (await db.plans.get(planId)) ?? null, [planId]);
  const day = plan?.days.find((d) => d.id === dayId);
  const exerciseIds = day?.items.map((i) => i.exerciseId) ?? [];
  const idsKey = exerciseIds.join('|');
  const exercises = useLiveQuery(() => db.exercises.bulkGet(exerciseIds), [idsKey]);
  const [renaming, setRenaming] = useState(false);
  const [picking, setPicking] = useState(false);

  if (plan === undefined) {
    return <article><p className="plan-muted">Ładowanie…</p></article>;
  }

  if (plan === null || !day) {
    return (
      <article>
        <p>Nie znaleziono dnia</p>
        <Link to={plan ? `/plany/${plan.id}` : '/plany'} className="plan-btn">Wróć</Link>
      </article>
    );
  }

  return (
    <article className="day-page">
      <Link to={`/plany/${plan.id}`} className="plan-back" aria-label="Wróć do planu">
        <ArrowLeft size={18} aria-hidden="true" />
        {plan.name}
      </Link>

      <div className="plan-title-row">
        <h1>{day.name}</h1>
        <button type="button" className="icon-btn" aria-label="Zmień nazwę dnia" onClick={() => setRenaming(true)}>
          <Pencil size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="plan-muted day-page__count">{exercisesLabel(day.items.length)}</p>

      {day.items.length === 0 && <p className="plan-muted">Brak ćwiczeń w tym dniu.</p>}

      <div className="plan-list">
        {day.items.map((item, i) => (
          <ItemCard
            key={`${i}-${item.exerciseId}`}
            planId={plan.id}
            dayId={day.id}
            index={i}
            count={day.items.length}
            item={item}
            exercise={exercises?.[i]}
          />
        ))}
      </div>

      <div className="day-page__add">
        <button type="button" className="plan-btn plan-btn--primary plan-btn--block" onClick={() => setPicking(true)}>
          Dodaj ćwiczenia
        </button>
      </div>

      {renaming && (
        <NameSheet
          title="Zmień nazwę"
          initialValue={day.name}
          onCancel={() => setRenaming(false)}
          onSave={async (name) => {
            await renameDay(plan.id, day.id, name);
            setRenaming(false);
          }}
        />
      )}

      {picking && (
        <ExercisePicker
          existingIds={day.items.map((i) => i.exerciseId)}
          onDone={(ids) => addItems(plan.id, day.id, ids)}
          onClose={() => setPicking(false)}
        />
      )}
    </article>
  );
}
