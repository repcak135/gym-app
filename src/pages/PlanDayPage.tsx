import { Fragment, useState } from 'react';
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
  linkWithNext,
  unlinkItem,
} from '../data/plans';
import { groupAt, groupLabel, groupsOf, linkItems } from '../data/supersets';
import { removeItemUndoable } from '../data/undoable';
import { showUndo } from '../undo';
import SwipeRow from '../components/SwipeRow';
import type { Exercise, Measure, PlanItem } from '../data/types';
import { measureOf } from '../data/measure';
import ExerciseThumb from '../components/ExerciseThumb';
import ExercisePicker from '../components/ExercisePicker';
import NameSheet from '../components/NameSheet';
import { useStartDay } from '../components/useStartDay';
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

const TIME_TARGETS = Array.from({ length: 20 }, (_, i) => 15 + i * 15);
const DISTANCE_TARGETS = [10, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500, 800, 1000];
const CARDIO_MINUTES = Array.from({ length: 18 }, (_, i) => 5 + i * 5);

/** Target of a time / distance / cardio item, instead of the reps range. */
function TargetField({ item, measure, onSave }: { item: PlanItem; measure: Exclude<Measure, 'reps'>; onSave: (p: Partial<Omit<PlanItem, 'exerciseId'>>) => void }) {
  let label: string;
  let value: number;
  let options: { value: number; text: string }[];
  let save: (v: number) => void;
  if (measure === 'time') {
    label = 'Cel (s)';
    value = item.targetSec ?? 30;
    options = TIME_TARGETS.map((v) => ({ value: v, text: String(v) }));
    save = (v) => onSave({ targetSec: v });
  } else if (measure === 'distance') {
    label = 'Cel (m)';
    value = item.targetM ?? 40;
    options = DISTANCE_TARGETS.map((v) => ({ value: v, text: String(v) }));
    save = (v) => onSave({ targetM: v });
  } else {
    label = 'Cel (min)';
    value = Math.round((item.targetSec ?? 1200) / 60) * 60;
    options = CARDIO_MINUTES.map((v) => ({ value: v * 60, text: String(v) }));
    save = (v) => onSave({ targetSec: v });
  }
  if (!options.some((o) => o.value === value)) {
    options = [...options, { value, text: measure === 'timeDistance' ? String(Math.round(value / 60)) : String(value) }].sort((a, b) => a.value - b.value);
  }
  return (
    <div className="item-field">
      <span className="item-field__label">{label}</span>
      <select className="item-input item-select" aria-label={label} value={value} onChange={(e) => save(Number(e.target.value))}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.text}</option>
        ))}
      </select>
    </div>
  );
}

interface ItemCardProps {
  planId: string;
  dayId: string;
  index: number;
  count: number;
  item: PlanItem;
  items: PlanItem[];
  exercise: Exercise | undefined;
}

async function removeItemWithUndo(planId: string, dayId: string, index: number, name: string) {
  const restore = await removeItemUndoable(planId, dayId, index);
  showUndo(`Usunięto ćwiczenie „${name}”`, restore);
}

function ItemCard({ planId, dayId, index, count, item, items, exercise }: ItemCardProps) {
  const name = exercise?.name ?? 'Nieznane ćwiczenie';
  const patch = (p: Partial<Omit<PlanItem, 'exerciseId'>>) => void updateItem(planId, dayId, index, p);
  const measure = measureOf(exercise);

  const restOptions = REST_OPTIONS.includes(item.restSec)
    ? REST_OPTIONS
    : [...REST_OPTIONS, item.restSec].sort((a, b) => a - b);

  const canLink = linkItems(items, index) !== null;
  const group = groupAt(items, index);
  const grouped = group !== null;
  const restHidden = group !== null && index < group.end;
  const restLabel = grouped ? 'Przerwa po rundzie' : 'Przerwa';

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

        {measure === 'reps' ? (
          <RepsFields key={`${item.repsMin}-${item.repsMax}`} item={item} onSave={patch} />
        ) : (
          <TargetField item={item} measure={measure} onSave={patch} />
        )}

        {restHidden ? (
          <p className="muted item-field item-field--wide">Przerwa po rundzie — ustaw przy ostatnim ćwiczeniu</p>
        ) : (
          <div className="item-field">
            <span className="item-field__label">{restLabel}</span>
            <select
              className="item-input item-select"
              aria-label={restLabel}
              value={item.restSec}
              onChange={(e) => patch({ restSec: Number(e.target.value) })}
            >
              {restOptions.map((s) => (
                <option key={s} value={s}>{formatRest(s)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="item-card__actions">
        {canLink && (
          <button type="button" className="item-card__link" onClick={() => void linkWithNext(planId, dayId, index)}>
            Połącz z następnym
          </button>
        )}
        {grouped && (
          <button type="button" className="item-card__link" onClick={() => void unlinkItem(planId, dayId, index)}>
            Odłącz z superserii
          </button>
        )}
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
          onClick={() => void removeItemWithUndo(planId, dayId, index, name)}
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
  const { start, sheet: startSheet } = useStartDay();

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

  const groups = groupsOf(day.items);

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

      <button
        type="button"
        className="plan-btn plan-btn--primary plan-btn--block day-page__start"
        disabled={day.items.length === 0}
        onClick={() => start(plan.id, day.id)}
      >
        Rozpocznij trening
      </button>

      {day.items.length === 0 && <p className="plan-muted">Brak ćwiczeń w tym dniu.</p>}

      <div className="plan-list list-in">
        {day.items.map((item, i) => {
          const g = groups.find((x) => i >= x.start && i <= x.end);
          return (
            <Fragment key={`${i}-${item.exerciseId}`}>
              {g && g.start === i && (
                <div className="day-group__head">
                  <strong>{groupLabel(g.end - g.start + 1)}</strong>
                  <span>Robisz po jednej serii z każdego ćwiczenia, przerwa po rundzie</span>
                </div>
              )}
              <div
                className={g ? `day-group${g.start === i ? ' day-group--first' : ''}${g.end === i ? ' day-group--last' : ''}` : undefined}
              >
                <SwipeRow
                  label={exercises?.[i]?.name ?? 'Nieznane ćwiczenie'}
                  onDelete={() => removeItemWithUndo(plan.id, day.id, i, exercises?.[i]?.name ?? 'Nieznane ćwiczenie')}
                  index={i}
                >
                  <ItemCard
                    planId={plan.id}
                    dayId={day.id}
                    index={i}
                    count={day.items.length}
                    item={item}
                    items={day.items}
                    exercise={exercises?.[i]}
                  />
                </SwipeRow>
              </div>
            </Fragment>
          );
        })}
      </div>

      <div className="day-page__add">
        <button type="button" className="plan-btn plan-btn--primary plan-btn--block" onClick={() => setPicking(true)}>
          Dodaj ćwiczenia
        </button>
      </div>

      {startSheet}

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
