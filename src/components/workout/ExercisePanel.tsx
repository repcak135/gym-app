import { useEffect, useRef, useState } from 'react';
import { Calculator, Check, Minus, Plus } from 'lucide-react';
import PlateCalculatorSheet from '../PlateCalculatorSheet';
import DifficultySheet from './DifficultySheet';
import { rirToRpeLabel } from '../../data/difficulty';
import type { Exercise, Measure, RestSoundPreset, WorkoutExercise, WorkoutSet } from '../../data/types';
import { formatDistance, formatDuration, measureOf, parseDuration } from '../../data/measure';
import Stopwatch from './Stopwatch';
import { formatKg, formatSetShort, parseWeight } from '../../data/progression';
import { setTargets, timeTargets, type EffortTarget } from '../../data/setTargets';
import ProgressionHelpSheet from './ProgressionHelpSheet';
import { formatReps, formatRest } from '../../data/plans';
import { setsLabel } from '../../data/plural';
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
  /** End sound / vibration of the stopwatch (same as the rest timer). */
  restSoundPreset: RestSoundPreset;
  restVibration: boolean;
  /** How hard the owner wants to train (Ustawienia). */
  effort: EffortTarget;
  /** Last 3 sessions brought no progress. */
  stagnating: boolean;
  /** Open the difficulty sheet right after "Zalicz serię". */
  askDifficulty?: boolean;
  onInfo: (tab: InfoTab) => void;
  onConfirmRemoveSet: (set: WorkoutSet) => void;
  /** Called after "Zalicz serię"; exerciseDone = it was the last uncompleted set of this exercise. */
  onSetCompleted?: (index: number, exerciseDone: boolean) => void;
  /** Superset / circuit chip above the name, e.g. "Superseria 1/2 · dalej: Wiosłowanie". */
  groupChip?: string;
}

function targetLine(item: WorkoutExercise, measure: Measure): string {
  if (measure === 'reps') return `${item.sets} × ${formatReps(item)} powt.`;
  if (measure === 'time' && item.targetSec) return `${item.sets} × ${formatDuration(item.targetSec)}`;
  if (measure === 'distance' && item.targetM) return `${item.sets} × ${formatDistance(item.targetM, 'distance')}`;
  if (measure === 'timeDistance' && item.targetSec) {
    return `${item.sets} × ${item.targetSec % 60 === 0 ? `${item.targetSec / 60} min` : formatDuration(item.targetSec)}`;
  }
  return setsLabel(item.sets);
}

/** Row text of a time / distance set (formatSetShort, but never an empty "0x0"). */
function timedText(s: WorkoutSet, measure: Measure): string {
  if ((s.durationSec ?? 0) > 0 || (s.distanceM ?? 0) > 0) return formatSetShort(s);
  const kg = s.weight > 0 ? `${formatKg(s.weight)} kg · ` : '';
  return kg + (measure === 'distance' ? '0 m' : '0:00');
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
  format,
  parse: parseText,
}: {
  value: number;
  label: string;
  decimal: boolean;
  onCommit: (n: number) => void;
  format?: (n: number) => string;
  parse?: (t: string) => number | null;
}) {
  const shown = format ? format(value) : decimal ? formatKg(value) : String(value);
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(shown);
  }, [shown, focused]);
  const parse = (t: string) => {
    if (parseText) return parseText(t);
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

/**
 * Smoothly scrolls the nearest vertical scroller (or the page) so `el` is fully visible,
 * clear of the top bar and the rest bar. Only vertical: `scrollIntoView` would also move the
 * horizontal exercise pager (e.g. back from a superset partner).
 */
function revealVertically(el: HTMLElement, top = 72, bottom = 120): void {
  let scroller: HTMLElement | null = el.parentElement;
  while (scroller && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) {
    scroller = scroller.parentElement;
  }
  const box = el.getBoundingClientRect();
  const view = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  let delta = 0;
  if (box.top < view.top + top) delta = box.top - view.top - top;
  else if (box.bottom > view.bottom - bottom) delta = Math.min(box.bottom - view.bottom + bottom, box.top - view.top - top);
  if (delta === 0) return;
  if (scroller) scroller.scrollBy({ top: delta, behavior: 'smooth' });
  else window.scrollBy({ top: delta, behavior: 'smooth' });
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
  restSoundPreset,
  restVibration,
  onInfo,
  onConfirmRemoveSet,
  onSetCompleted,
  groupChip,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [warmupOpen, setWarmupOpen] = useState(false);
  const [diffSetId, setDiffSetId] = useState<string | null>(null);
  const pendingDone = useRef(false);
  const pendingExerciseDone = useRef(false);
  const diffSet = sets.find((s) => s.id === diffSetId);
  // The set just ticked off plays the green fill + check pop once.
  const [justDone, setJustDone] = useState<string | null>(null);
  useEffect(() => {
    if (!justDone) return;
    const id = setTimeout(() => setJustDone(null), 500);
    return () => clearTimeout(id);
  }, [justDone]);
  const editorRef = useRef<HTMLDivElement>(null);
  // Set by a tap on a row or a completed set (not on first render): bring the editor into view.
  const revealEditor = useRef(false);
  const selected =
    sets.find((s) => s.id === selectedId) ?? sets.find((s) => s.completedAt === undefined) ?? sets.at(-1);

  useEffect(() => {
    if (!revealEditor.current) return;
    revealEditor.current = false;
    // The whole set (its row + the editor), so the tapped row stays visible above the editor.
    const li = editorRef.current?.closest('li');
    if (li) revealVertically(li);
  }, [selected?.id]);

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
  const measure = measureOf(exercise);
  const isReps = measure === 'reps';
  const timeT = timeTargets({
    lastDurations: lastWorking.map((s) => s.durationSec ?? 0),
    count: workingSets.length,
    targetSec: item.targetSec,
  });
  const timeStep = measure === 'timeDistance' ? 30 : 5;
  const distStep = measure === 'timeDistance' ? 100 : 5;
  const selectedWorkingIndex = selected && !selected.warmup ? workingSets.findIndex((s) => s.id === selected.id) : -1;
  const [deloaded, setDeloaded] = useState(false);
  // After "Zastosuj −10%" the old target no longer matches the weights, so no reason line.
  const reason =
    !deloaded && selected && selected.completedAt === undefined && selectedWorkingIndex >= 0
      ? measure === 'reps'
        ? targets[selectedWorkingIndex]?.text
        : measure === 'time'
          ? timeT[selectedWorkingIndex]?.text
          : lastWorking.length > 0
            ? 'Jak ostatnio'
            : undefined
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
    revealEditor.current = true;
    setSelectedId(null); // move on to the next undone set
    const exerciseDone = sets.every((s) => s.id === set.id || s.completedAt !== undefined);
    if (askDifficulty && showRir) {
      setDiffSetId(set.id);
      // Moving on (next exercise / superset partner) waits until the difficulty sheet is closed.
      pendingDone.current = true;
      pendingExerciseDone.current = exerciseDone;
    } else onSetCompleted?.(index, exerciseDone);
  };

  const closeDifficulty = () => {
    setDiffSetId(null);
    if (pendingDone.current) {
      pendingDone.current = false;
      onSetCompleted?.(index, pendingExerciseDone.current);
    }
  };

  // The open set's editor sits right under its row (one open at a time).
  const editor = selected ? (
        <div ref={editorRef} className={`set-editor${selected.completedAt !== undefined ? ' set-editor--done' : ''}`}>
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
              {isReps ? 'Ciężar (kg)' : 'Ciężar (kg, opcjonalnie)'}
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
          {isReps ? (
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
          ) : (
            <>
              {measure !== 'distance' && (
                <div className="set-editor__field">
                  <span className="set-editor__label">Czas</span>
                  <div className="set-editor__stepper">
                    <button
                      type="button"
                      aria-label="Mniej czasu"
                      onClick={() => void updateSet(selected.id, { durationSec: Math.max(0, (selected.durationSec ?? 0) - timeStep) })}
                    >
                      <Minus size={22} aria-hidden="true" />
                    </button>
                    <NumberField
                      label="Czas"
                      decimal={false}
                      value={selected.durationSec ?? 0}
                      format={formatDuration}
                      parse={parseDuration}
                      onCommit={(n) => void updateSet(selected.id, { durationSec: n })}
                    />
                    <button
                      type="button"
                      aria-label="Więcej czasu"
                      onClick={() => void updateSet(selected.id, { durationSec: (selected.durationSec ?? 0) + timeStep })}
                    >
                      <Plus size={22} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
              {measure !== 'time' && (
                <div className="set-editor__field">
                  <span className="set-editor__label">{measure === 'distance' ? 'Dystans (m)' : 'Dystans (km)'}</span>
                  <div className="set-editor__stepper">
                    <button
                      type="button"
                      aria-label="Mniej dystansu"
                      onClick={() => void updateSet(selected.id, { distanceM: Math.max(0, (selected.distanceM ?? 0) - distStep) })}
                    >
                      <Minus size={22} aria-hidden="true" />
                    </button>
                    <NumberField
                      label="Dystans"
                      decimal={measure === 'timeDistance'}
                      value={selected.distanceM ?? 0}
                      format={measure === 'timeDistance' ? (m) => formatKg(m / 1000) : undefined}
                      parse={
                        measure === 'timeDistance'
                          ? (t) => {
                              const n = parseWeight(t);
                              return n === null ? null : Math.round(n * 1000);
                            }
                          : undefined
                      }
                      onCommit={(n) => void updateSet(selected.id, { distanceM: n })}
                    />
                    <button
                      type="button"
                      aria-label="Więcej dystansu"
                      onClick={() => void updateSet(selected.id, { distanceM: (selected.distanceM ?? 0) + distStep })}
                    >
                      <Plus size={22} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
              {measure !== 'distance' && selected.completedAt === undefined && (
                <Stopwatch
                  targetSec={measure === 'time' ? (timeT[Math.max(0, selectedWorkingIndex)]?.durationSec ?? item.targetSec) : item.targetSec}
                  preset={restSoundPreset}
                  vibration={restVibration}
                  onStop={(sec) => void updateSet(selected.id, { durationSec: sec })}
                />
              )}
            </>
          )}
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
          {isReps && (
          <label className="set-editor__warmup">
            <input
              type="checkbox"
              checked={selected.warmup}
              onChange={(e) => void updateSet(selected.id, { warmup: e.target.checked })}
            />
            Rozgrzewka
          </label>
          )}
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
            {isReps && firstWork > 0 && (
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
  ) : null;

  return (
    <section className="ex-panel" aria-label={exercise?.name ?? 'Ćwiczenie'}>
      {groupChip && <p className="ex-panel__group">{groupChip}</p>}
      <h2 className="ex-panel__name">{exercise?.name ?? 'Nieznane ćwiczenie'}</h2>
      <p className="ex-panel__target">
        {targetLine(item, measure)} · przerwa {formatRest(item.restSec)}
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
                aria-label={`Seria ${setLabel(sets, s)}: ${isReps ? `${formatKg(s.weight)} kg × ${s.reps}` : timedText(s, measure)}${s.rir !== undefined ? `, ${rirToRpeLabel(s.rir)}` : ''}${done ? ', zaliczona' : ''}`}
                onClick={() => {
                  revealEditor.current = true;
                  setSelectedId(s.id);
                }}
              >
                <span className="set-row__num">{setLabel(sets, s)}</span>
                <span className="set-row__val">
                  {isReps ? (
                    <>
                      {formatKg(s.weight)} <small>kg</small> × {s.reps}
                    </>
                  ) : (
                    timedText(s, measure)
                  )}
                  {s.rir !== undefined && <small className="set-row__rir"> · {rirToRpeLabel(s.rir)}</small>}
                </span>
                <span className="set-row__check" aria-hidden="true">{done && <Check size={18} strokeWidth={3} />}</span>
              </button>
              {isSel && editor}
            </li>
          );
        })}
      </ol>

      {!selected && (
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
