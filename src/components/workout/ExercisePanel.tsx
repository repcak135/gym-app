import { useEffect, useState } from 'react';
import { Calculator, Check, Minus, Plus } from 'lucide-react';
import PlateCalculatorSheet from '../PlateCalculatorSheet';
import type { Exercise, WorkoutExercise, WorkoutSet } from '../../data/types';
import { formatKg, formatRir, formatSetShort, parseWeight, progressionText, suggestProgression } from '../../data/progression';
import { formatReps, formatRest } from '../../data/plans';
import {
  addSet,
  applyWeight,
  completeSet,
  removeSet,
  uncompleteSet,
  updateSet,
} from '../../data/workouts';
import { unlockAudio } from '../../audio/beep';
import { haptic } from '../../haptics';
import type { InfoTab } from './ExerciseInfoSheet';

interface Props {
  workoutId: string;
  index: number;
  item: WorkoutExercise;
  exercise?: Exercise;
  sets: WorkoutSet[];
  /** Completed sets of the last finished workout with this exercise. */
  lastSets: WorkoutSet[];
  note?: string;
  step: number;
  showRir: boolean;
  onInfo: (tab: InfoTab) => void;
  onConfirmRemoveSet: (set: WorkoutSet) => void;
  /** Called when "Zalicz serię" completed the last uncompleted set of this exercise. */
  onExerciseDone?: (index: number) => void;
}

function setLabel(sets: WorkoutSet[], set: WorkoutSet): string {
  const same = sets.filter((s) => s.warmup === set.warmup);
  const n = same.findIndex((s) => s.id === set.id) + 1;
  return set.warmup ? `R${n}` : `${n}`;
}

/** Text field that saves every valid value as it is typed and tidies up on blur. */
function NumberField({
  value,
  label,
  decimal,
  onCommit,
}: {
  value: number;
  label: string;
  decimal: boolean;
  onCommit: (n: number) => void;
}) {
  const shown = decimal ? formatKg(value) : String(value);
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(shown);
  }, [shown, focused]);
  const parse = (t: string) => {
    const n = parseWeight(t);
    return n === null ? null : decimal ? n : Math.round(n);
  };
  return (
    <input
      className="set-editor__input"
      aria-label={label}
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={text}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setText(e.target.value);
        const n = parse(e.target.value);
        if (n !== null) onCommit(n);
      }}
      onBlur={() => {
        setFocused(false);
        setText(shown);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

export default function ExercisePanel({
  workoutId,
  index,
  item,
  exercise,
  sets,
  lastSets,
  note,
  step,
  showRir,
  onInfo,
  onConfirmRemoveSet,
  onExerciseDone,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);
  // The set just ticked off plays the green fill + check pop once.
  const [justDone, setJustDone] = useState<string | null>(null);
  useEffect(() => {
    if (!justDone) return;
    const id = setTimeout(() => setJustDone(null), 500);
    return () => clearTimeout(id);
  }, [justDone]);
  const selected =
    sets.find((s) => s.id === selectedId) ?? sets.find((s) => s.completedAt === undefined) ?? sets.at(-1);

  const lastWorking = lastSets.filter((s) => !s.warmup);
  const suggestion = suggestProgression(lastWorking, item.repsMin, item.repsMax, step);
  const showHint = suggestion.kind !== 'none' && !(suggestion.kind === 'increase' && suggestion.fromWeight === 0);
  const canApply =
    suggestion.kind === 'increase' &&
    sets.some((s) => !s.warmup && s.completedAt === undefined && s.weight !== suggestion.weight);

  const complete = async (set: WorkoutSet) => {
    unlockAudio();
    await completeSet(set.id);
    haptic('tick');
    setJustDone(set.id);
    setSelectedId(null); // move on to the next undone set
    if (sets.every((s) => s.id === set.id || s.completedAt !== undefined)) onExerciseDone?.(index);
  };

  return (
    <section className="ex-panel" aria-label={exercise?.name ?? 'Ćwiczenie'}>
      <h2 className="ex-panel__name">{exercise?.name ?? 'Nieznane ćwiczenie'}</h2>
      <p className="ex-panel__target">
        {item.sets} × {formatReps(item)} powt. · przerwa {formatRest(item.restSec)}
      </p>

      <div className="ex-panel__info">
        <button type="button" onClick={() => onInfo('historia')}>Historia</button>
        <button type="button" onClick={() => onInfo('notatki')}>Notatki</button>
        <button type="button" onClick={() => onInfo('statystyki')}>Statystyki</button>
      </div>

      {note && (
        <button type="button" className="ex-panel__note" onClick={() => onInfo('notatki')}>
          {note}
        </button>
      )}

      {lastWorking.length > 0 && (
        <div className="ex-panel__hint">
          <p className="ex-panel__last">
            Ostatnio: {lastWorking.map(formatSetShort).join(', ')}
          </p>
          {showHint && <p className="ex-panel__suggest">{progressionText(suggestion)}</p>}
          {canApply && suggestion.kind === 'increase' && (
            <button
              type="button"
              className="ex-panel__apply"
              onClick={() => void applyWeight(workoutId, item.exerciseId, suggestion.weight)}
            >
              Użyj {formatKg(suggestion.weight)} kg
            </button>
          )}
        </div>
      )}

      <ol className="set-list" aria-label="Serie">
        {sets.map((s) => {
          const done = s.completedAt !== undefined;
          const isSel = s.id === selected?.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`set-row${done ? ' set-row--done' : ''}${done && s.id === justDone ? ' set-row--just-done' : ''}${isSel ? ' set-row--selected' : ''}${s.warmup ? ' set-row--warmup' : ''}`}
                aria-current={isSel ? 'true' : undefined}
                aria-label={`Seria ${setLabel(sets, s)}: ${formatKg(s.weight)} kg × ${s.reps}${s.rir !== undefined ? `, RIR ${formatRir(s.rir)}` : ''}${done ? ', zaliczona' : ''}`}
                onClick={() => setSelectedId(s.id)}
              >
                <span className="set-row__num">{setLabel(sets, s)}</span>
                <span className="set-row__val">
                  {formatKg(s.weight)} <small>kg</small> × {s.reps}
                  {s.rir !== undefined && <small className="set-row__rir"> · RIR {formatRir(s.rir)}</small>}
                </span>
                <span className="set-row__check" aria-hidden="true">{done && <Check size={18} strokeWidth={3} />}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {selected ? (
        <div className={`set-editor${selected.completedAt !== undefined ? ' set-editor--done' : ''}`}>
          <p className="set-editor__title">
            {selected.warmup ? 'Rozgrzewka' : 'Seria'} {setLabel(sets, selected).replace('R', '')}
            {selected.completedAt !== undefined && <span className="set-editor__badge">zaliczona</span>}
          </p>
          <div className="set-editor__field">
            <span className="set-editor__label">
              Ciężar (kg)
              <button
                type="button"
                className="set-editor__calc"
                aria-label="Kalkulator talerzy"
                onClick={() => setCalcOpen(true)}
              >
                <Calculator size={18} aria-hidden="true" />
              </button>
            </span>
            <div className="set-editor__stepper">
              <button
                type="button"
                aria-label="Mniej kg"
                onClick={() => void updateSet(selected.id, { weight: Math.max(0, selected.weight - step) })}
              >
                <Minus size={22} aria-hidden="true" />
              </button>
              <NumberField
                label="Ciężar"
                decimal
                value={selected.weight}
                onCommit={(n) => void updateSet(selected.id, { weight: n })}
              />
              <button
                type="button"
                aria-label="Więcej kg"
                onClick={() => void updateSet(selected.id, { weight: selected.weight + step })}
              >
                <Plus size={22} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="set-editor__field">
            <span className="set-editor__label">Powtórzenia</span>
            <div className="set-editor__stepper">
              <button
                type="button"
                aria-label="Mniej powtórzeń"
                onClick={() => void updateSet(selected.id, { reps: Math.max(0, selected.reps - 1) })}
              >
                <Minus size={22} aria-hidden="true" />
              </button>
              <NumberField
                label="Powtórzenia"
                decimal={false}
                value={selected.reps}
                onCommit={(n) => void updateSet(selected.id, { reps: n })}
              />
              <button
                type="button"
                aria-label="Więcej powtórzeń"
                onClick={() => void updateSet(selected.id, { reps: selected.reps + 1 })}
              >
                <Plus size={22} aria-hidden="true" />
              </button>
            </div>
          </div>
          {showRir && (
            <div className="set-editor__field">
              <span className="set-editor__label" id={`rir-${selected.id}`}>RIR (powtórzenia w zapasie, opcjonalnie)</span>
              <div className="set-editor__rir" role="group" aria-labelledby={`rir-${selected.id}`}>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`RIR ${formatRir(n)}`}
                    aria-pressed={selected.rir === n}
                    onClick={() => void updateSet(selected.id, { rir: selected.rir === n ? null : n })}
                  >
                    {formatRir(n)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="set-editor__warmup">
            <input
              type="checkbox"
              checked={selected.warmup}
              onChange={(e) => void updateSet(selected.id, { warmup: e.target.checked })}
            />
            Rozgrzewka
          </label>
          {selected.completedAt === undefined ? (
            <button type="button" className="set-editor__complete" onClick={() => void complete(selected)}>
              <Check size={22} strokeWidth={3} aria-hidden="true" /> Zalicz serię
            </button>
          ) : (
            <button type="button" className="set-editor__undo" onClick={() => void uncompleteSet(selected.id)}>
              Cofnij zaliczenie
            </button>
          )}
          <div className="set-editor__more">
            <button type="button" onClick={() => void addSet(workoutId, index).then(() => setSelectedId(null))}>
              + Seria
            </button>
            <button
              type="button"
              onClick={() => {
                if (selected.completedAt !== undefined) onConfirmRemoveSet(selected);
                else void removeSet(selected.id).then(() => setSelectedId(null));
              }}
            >
              Usuń serię
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="set-editor__complete" onClick={() => void addSet(workoutId, index)}>
          + Dodaj serię
        </button>
      )}
      {calcOpen && selected && (
        <PlateCalculatorSheet
          initialWeight={selected.weight}
          exercise={exercise}
          onUse={(kg) => void updateSet(selected.id, { weight: kg })}
          onClose={() => setCalcOpen(false)}
        />
      )}
    </section>
  );
}
