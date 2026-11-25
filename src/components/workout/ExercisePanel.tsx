import { useEffect, useRef, useState } from 'react';
import { Calculator, Check, Minus, Plus } from 'lucide-react';
import PlateCalculatorSheet from '../PlateCalculatorSheet';
import DifficultySheet from './DifficultySheet';
import { rirToRpeLabel } from '../../data/difficulty';
import type { Exercise, WorkoutExercise, WorkoutSet } from '../../data/types';
import { formatKg, formatSetShort, parseWeight } from '../../data/progression';
import { setTargets, type EffortTarget } from '../../data/setTargets';
import ProgressionHelpSheet from './ProgressionHelpSheet';
import { formatReps, formatRest } from '../../data/plans';
import {
  addSet,
  completeSet,
  removeSet,
  replaceWarmups,
  scaleWorkingWeights,
  uncompleteSet,
  updateSet,
} from '../../data/workouts';
import { unlockAudio } from '../../audio/beep';
import { haptic } from '../../haptics';
import type { InfoTab } from './ExerciseInfoSheet';
import WarmupSheet from './WarmupSheet';
import { warmupRamp } from '../../data/warmup';

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
  /** Default bar weight and available plates (Ustawienia), for the warm-up generator. */
  barWeight: number;
  plates: number[];
  showRir: boolean;
  /** How hard the owner wants to train (Ustawienia). */
  effort: EffortTarget;
  /** Last 3 sessions brought no progress. */
  stagnating: boolean;
  /** Open the difficulty sheet right after "Zalicz serię". */
  askDifficulty?: boolean;
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
  barWeight,
  plates,
  showRir,
  effort,
  stagnating,
  askDifficulty = false,
  onInfo,
  onConfirmRemoveSet,
  onExerciseDone,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [warmupOpen, setWarmupOpen] = useState(false);
  const [diffSetId, setDiffSetId] = useState<string | null>(null);
  const pendingDone = useRef(false);
  const diffSet = sets.find((s) => s.id === diffSetId);
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
  const workingSets = sets.filter((s) => !s.warmup);
  const targets = setTargets({
    lastWorking,
    count: workingSets.length,
    repsMin: item.repsMin,
    repsMax: item.repsMax,
    step,
    effort,
  });
  const selectedWorkingIndex = selected && !selected.warmup ? workingSets.findIndex((s) => s.id === selected.id) : -1;
  const [deloaded, setDeloaded] = useState(false);
  // After "Zastosuj −10%" the old target no longer matches the weights, so no reason line.
  const reason =
    !deloaded && selected && selected.completedAt === undefined && selectedWorkingIndex >= 0
      ? targets[selectedWorkingIndex]?.text
      : undefined;
  const firstWork = workingSets[0]?.weight ?? 0;
  const isBarbell = exercise?.equipment === 'barbell' || exercise?.equipment === 'e-z curl bar';
  const ramp = warmupRamp({
    work: firstWork,
    bar: isBarbell ? (exercise?.barWeight ?? barWeight) : null,
    plates,
    step,
  });
  const showStagnation = stagnating && (deloaded || !workingSets.some((s) => s.completedAt !== undefined));

  const complete = async (set: WorkoutSet) => {
    unlockAudio();
    await completeSet(set.id);
    haptic('tick');
    setJustDone(set.id);
    setSelectedId(null); // move on to the next undone set
    const exerciseDone = sets.every((s) => s.id === set.id || s.completedAt !== undefined);
    if (askDifficulty && showRir) {
      setDiffSetId(set.id);
      // Auto-advance waits until the difficulty sheet is closed.
      pendingDone.current = exerciseDone;
    } else if (exerciseDone) onExerciseDone?.(index);
  };

  const closeDifficulty = () => {
    setDiffSetId(null);
    if (pendingDone.current) {
      pendingDone.current = false;
      onExerciseDone?.(index);
    }
  };

  return (
    <section className="ex-panel" aria-label={exercise?.name ?? 'Ćwiczenie'}>
      <h2 className="ex-panel__name">{exercise?.name ?? 'Nieznane ćwiczenie'}</h2>
      <p className="ex-panel__target">
        {item.sets} × {formatReps(item)} powt. · przerwa {formatRest(item.restSec)}
      </p>

      <div className="ex-panel__info">
        <button type="button" onClick={() => onInfo('opis')}>Opis</button>
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
        </div>
      )}

      {showStagnation && (
        <div className="ex-panel__stagnation">
          {deloaded ? (
            <p>Ciężar zmniejszony o ok. 10% na ten trening</p>
          ) : (
            <>
              <p>3 treningi bez postępu — rozważ zejście o ok. 10% i zbudowanie od nowa</p>
              <button
                type="button"
                className="ex-panel__apply"
                onClick={() => void scaleWorkingWeights(workoutId, item.exerciseId, step).then(() => setDeloaded(true))}
              >
                Zastosuj −10%
              </button>
            </>
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
                aria-label={`Seria ${setLabel(sets, s)}: ${formatKg(s.weight)} kg × ${s.reps}${s.rir !== undefined ? `, ${rirToRpeLabel(s.rir)}` : ''}${done ? ', zaliczona' : ''}`}
                onClick={() => setSelectedId(s.id)}
              >
                <span className="set-row__num">{setLabel(sets, s)}</span>
                <span className="set-row__val">
                  {formatKg(s.weight)} <small>kg</small> × {s.reps}
                  {s.rir !== undefined && <small className="set-row__rir"> · {rirToRpeLabel(s.rir)}</small>}
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
          {reason && (
            <div className="set-editor__reasonrow">
              <p className="set-editor__reason">{reason}</p>
              <button
                type="button"
                className="set-editor__help"
                aria-label="Jak działa podpowiedź?"
                onClick={() => setHelpOpen(true)}
              >
                ?
              </button>
            </div>
          )}
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
            <div className="set-editor__field set-editor__field--inline">
              <span className="set-editor__label">Trudność</span>
              <button
                type="button"
                className={`set-editor__diff${selected.rir !== undefined ? ' set-editor__diff--set' : ''}`}
                aria-label={`Trudność serii: ${selected.rir !== undefined ? rirToRpeLabel(selected.rir) : 'oceń'}`}
                onClick={() => setDiffSetId(selected.id)}
              >
                {selected.rir !== undefined ? rirToRpeLabel(selected.rir) : 'Oceń'}
              </button>
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
            {firstWork > 0 && (
              <button type="button" onClick={() => setWarmupOpen(true)}>
                Rozgrzewka
              </button>
            )}
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
      {warmupOpen && (
        <WarmupSheet
          work={firstWork}
          ramp={ramp}
          replaces={sets.some((s) => s.warmup && s.completedAt === undefined)}
          onAdd={() => void replaceWarmups(workoutId, item.exerciseId, ramp).then(() => { setWarmupOpen(false); setSelectedId(null); })}
          onClose={() => setWarmupOpen(false)}
        />
      )}
      {helpOpen && <ProgressionHelpSheet onClose={() => setHelpOpen(false)} />}
      {diffSet && <DifficultySheet set={diffSet} onClose={closeDifficulty} />}
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
