import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router';
import { Check, ChevronLeft, GripVertical, ListChecks, MoreHorizontal } from 'lucide-react';
import { db } from '../data/db';
import { getSettings } from '../data/settings';
import { formatClock } from '../data/progression';
import { isStagnating } from '../data/setTargets';
import {
  addExercises,
  discardWorkout,
  finishWorkout,
  getActiveWorkout,
  getExerciseHistory,
  getLastSets,
  getWorkoutSets,
  moveExercise,
  removeExercise,
  removeSet,
  setCurrentIndex,
  swapExercise,
} from '../data/workouts';
import type { WorkoutSet } from '../data/types';
import { useNow } from '../hooks/useNow';
import { unlockAudio } from '../audio/beep';
import { useWakeLock } from '../hooks/useWakeLock';
import ExercisePanel from '../components/workout/ExercisePanel';
import RestBar, { RestEndBanner } from '../components/workout/RestBar';
import ExerciseInfoSheet, { type InfoTab } from '../components/workout/ExerciseInfoSheet';
import ExerciseThumb from '../components/ExerciseThumb';
import { isExerciseDone, nextAfterExerciseDone, setsWord, type ExerciseProgress } from '../data/workoutFlow';
import ExercisePicker from '../components/ExercisePicker';
import ActionSheet from '../components/ActionSheet';
import './PlansPage.css';
import './WorkoutPage.css';

function Elapsed({ since }: { since: number }) {
  const now = useNow(1000);
  return <span className="workout-bar__time" aria-label="Czas treningu">{formatClock((now - since) / 1000)}</span>;
}

type Sheet =
  | { kind: 'menu' }
  | { kind: 'finish' }
  | { kind: 'empty' }
  | { kind: 'discard' }
  | { kind: 'remove-exercise' }
  | { kind: 'remove-set'; set: WorkoutSet }
  | { kind: 'swap-refused' }
  | { kind: 'add' }
  | { kind: 'swap' }
  | { kind: 'info'; tab: InfoTab };

export default function WorkoutPage() {
  useWakeLock();
  const navigate = useNavigate();

  const data = useLiveQuery(async () => {
    const workout = await getActiveWorkout();
    if (!workout) return { workout: undefined };
    const items = workout.exercises ?? [];
    const [sets, exercises, notes, settings] = await Promise.all([
      getWorkoutSets(workout.id),
      db.exercises.bulkGet(items.map((i) => i.exerciseId)),
      db.notes.bulkGet(items.map((i) => i.exerciseId)),
      getSettings(),
    ]);
    return { workout, items, sets, exercises, notes, settings };
  });

  const workout = data?.workout;
  const items = data && data.workout ? data.items : [];

  // Last session per exercise: history does not change during a workout, so load it once per exercise.
  const [lastSets, setLastSets] = useState<Record<string, WorkoutSet[]>>({});
  const idsKey = items.map((i) => i.exerciseId).join(',');
  useEffect(() => {
    if (!workout) return;
    let alive = true;
    const missing = items.map((i) => i.exerciseId).filter((id) => !(id in lastSets));
    if (missing.length === 0) return;
    void Promise.all(missing.map((id) => getLastSets(id, workout.id))).then((res) => {
      if (!alive) return;
      setLastSets((prev) => {
        const next = { ...prev };
        missing.forEach((id, i) => (next[id] = res[i]));
        return next;
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, workout?.id]);

  // The 4 newest finished sessions per exercise (working sets) for the stagnation hint; also loaded once.
  const [recent, setRecent] = useState<Record<string, { weight: number; reps: number }[][]>>({});
  useEffect(() => {
    if (!workout) return;
    let alive = true;
    const missing = items.map((i) => i.exerciseId).filter((id) => !(id in recent));
    if (missing.length === 0) return;
    void Promise.all(missing.map((id) => getExerciseHistory(id, workout.id))).then((res) => {
      if (!alive) return;
      setRecent((prev) => {
        const next = { ...prev };
        missing.forEach((id, i) => {
          next[id] = res[i].slice(0, 4).map((h) =>
            h.sets.filter((s) => !s.warmup).map((s) => ({ weight: s.weight, reps: s.reps })),
          );
        });
        return next;
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, workout?.id]);

  // ---- pager ----
  const pager = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const savedIndex = workout?.currentIndex ?? 0;
  const current = Math.min(index ?? savedIndex, Math.max(0, items.length - 1));

  // On open, jump to the exercise the workout was left on.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !workout || !pager.current) return;
    restored.current = true;
    const el = pager.current;
    el.scrollTo({ left: savedIndex * el.clientWidth, behavior: 'instant' as ScrollBehavior });
    setIndex(savedIndex);
  }, [workout, savedIndex]);

  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onScroll = useCallback(() => {
    const el = pager.current;
    if (!el || !workout) return;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const i = Math.round(el.scrollLeft / el.clientWidth);
      // Never rest between two exercises (CSS snap does not always re-snap).
      if (Math.abs(el.scrollLeft - i * el.clientWidth) > 2) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
      setIndex(i);
      if (i !== workout.currentIndex) void setCurrentIndex(workout.id, i);
    }, 120);
  }, [workout]);

  const goTo = (i: number) => {
    const el = pager.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  // A newly added exercise: show it.
  const prevCount = useRef<number | null>(null);
  useEffect(() => {
    if (!workout) return;
    if (prevCount.current !== null && items.length > prevCount.current) {
      const i = items.length - 1;
      requestAnimationFrame(() => goTo(i));
    }
    prevCount.current = items.length;
  }, [items.length, workout]);

  const [banner, setBanner] = useState(false);
  const onRestEnd = useCallback(() => setBanner(true), []);
  const hideBanner = useCallback(() => setBanner(false), []);

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const close = () => setSheet(null);

  const setsByExercise = useMemo(() => {
    const map = new Map<string, WorkoutSet[]>();
    for (const s of data?.workout ? data.sets : []) {
      const list = map.get(s.exerciseId) ?? [];
      list.push(s);
      map.set(s.exerciseId, list);
    }
    return map;
  }, [data]);

  // ---- list view + auto-advance ----
  const [view, setView] = useState<'list' | 'exercise'>('exercise');
  const progress = useMemo<ExerciseProgress[]>(
    () =>
      items.map((it) => {
        const list = setsByExercise.get(it.exerciseId) ?? [];
        return { completed: list.filter((s) => s.completedAt !== undefined).length, total: list.length };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, setsByExercise],
  );
  const mode = data?.workout ? data.settings.afterExerciseDone : 'next';
  const latest = useRef({ progress, current, mode, view });
  latest.current = { progress, current, mode, view };

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(advanceTimer.current), []);
  const onExerciseDone = useCallback((doneIndex: number) => {
    clearTimeout(advanceTimer.current);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    advanceTimer.current = setTimeout(
      () => {
        const l = latest.current;
        // The user may have moved on or undone the set during the wait.
        if (l.view !== 'exercise' || l.current !== doneIndex || !isExerciseDone(l.progress[doneIndex] ?? { completed: 0, total: 0 })) return;
        const action = nextAfterExerciseDone(l.progress, doneIndex, l.mode);
        if (action.kind === 'list') setView('list');
        else if (action.kind === 'exercise') goTo(action.index);
      },
      reduce ? 0 : 700,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back from the list: the (hidden) pager shows the exercise that is current now.
  useEffect(() => {
    const el = pager.current;
    if (view !== 'exercise' || !el) return;
    el.scrollTo({ left: current * el.clientWidth, behavior: 'instant' as ScrollBehavior });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // ---- reorder (drag handle in the list, "Przesuń" in the menu) ----
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const dragInfo = useRef<{ startY: number; mids: number[]; from: number; to: number } | null>(null);

  const reorder = async (from: number, to: number) => {
    if (!workout || from === to) return;
    // Which position the exercise on screen ends up at.
    let next = current;
    if (current === from) next = to;
    else if (from < current && to >= current) next = current - 1;
    else if (from > current && to <= current) next = current + 1;
    await moveExercise(workout.id, from, to);
    setIndex(next);
    requestAnimationFrame(() => {
      const el = pager.current;
      if (el) el.scrollTo({ left: next * el.clientWidth, behavior: 'instant' as ScrollBehavior });
    });
  };

  const onHandleDown = (e: React.PointerEvent<HTMLButtonElement>, i: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const mids = rowRefs.current.slice(0, items.length).map((li) => {
      const r = li?.getBoundingClientRect();
      return r ? r.top + r.height / 2 : 0;
    });
    dragInfo.current = { startY: e.clientY, mids, from: i, to: i };
    setDrag({ from: i, dy: 0 });
  };
  const onHandleMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragInfo.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    const center = d.mids[d.from] + dy;
    d.to = d.mids.filter((m, k) => k !== d.from && m < center).length;
    setDrag({ from: d.from, dy });
  };
  const onHandleUp = (e: React.PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const d = dragInfo.current;
    if (!d) return;
    dragInfo.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDrag(null);
    if (commit) void reorder(d.from, d.to);
  };

  const openFromList = (i: number) => {
    if (workout) void setCurrentIndex(workout.id, i);
    setIndex(i);
    setView('exercise');
  };

  if (!data) return <div className="workout" />;
  if (!workout) {
    return (
      <div className="workout workout--none">
        <p>Nie ma trwającego treningu.</p>
        <Link to="/" className="plan-btn plan-btn--primary">Wróć na Start</Link>
      </div>
    );
  }

  const { exercises, notes, settings } = data as Exclude<typeof data, { workout: undefined }>;
  const currentItem = items[current];
  const currentName = exercises[current]?.name ?? 'Nieznane ćwiczenie';
  const currentHasDone = currentItem
    ? (setsByExercise.get(currentItem.exerciseId) ?? []).some((s) => s.completedAt !== undefined)
    : false;

  const finish = async () => {
    const result = await finishWorkout(workout.id);
    if (result === 'empty') setSheet({ kind: 'empty' });
    else navigate(`/trening/podsumowanie/${workout.id}`, { replace: true });
  };

  const discard = async () => {
    await discardWorkout(workout.id);
    navigate('/', { replace: true });
  };

  return (
    // Any tap unlocks audio (needed after the app was reopened mid-workout).
    <div className="workout" onPointerDown={unlockAudio}>
      <header className="workout-bar">
        <Link to="/" className="workout-bar__icon" aria-label="Wróć na Start (trening trwa dalej)">
          <ChevronLeft size={26} aria-hidden="true" />
        </Link>
        <div className="workout-bar__title">
          <h1>{workout.name}</h1>
          <Elapsed since={workout.startedAt} />
        </div>
        <button
          type="button"
          className={`workout-bar__icon${view === 'list' ? ' workout-bar__icon--on' : ''}`}
          aria-label="Lista ćwiczeń"
          aria-pressed={view === 'list'}
          onClick={() => setView(view === 'list' ? 'exercise' : 'list')}
        >
          <ListChecks size={24} aria-hidden="true" />
        </button>
        <button type="button" className="workout-bar__icon" aria-label="Opcje treningu" onClick={() => setSheet({ kind: 'menu' })}>
          <MoreHorizontal size={24} aria-hidden="true" />
        </button>
        <button type="button" className="workout-bar__finish" onClick={() => setSheet({ kind: 'finish' })}>
          Zakończ
        </button>
      </header>

      {view === 'exercise' && items.length > 1 && (
        <nav className="workout-dots" aria-label="Ćwiczenia">
          {items.map((it, i) => {
            const list = setsByExercise.get(it.exerciseId) ?? [];
            const allDone = list.length > 0 && list.every((s) => s.completedAt !== undefined);
            return (
              <button
                key={it.exerciseId}
                type="button"
                className={`workout-dot${i === current ? ' workout-dot--on' : ''}${allDone ? ' workout-dot--done' : ''}`}
                aria-label={`Ćwiczenie ${i + 1}: ${exercises[i]?.name ?? ''}`}
                aria-current={i === current ? 'step' : undefined}
                onClick={() => goTo(i)}
              />
            );
          })}
        </nav>
      )}

      {view === 'list' && (
        <div className="workout-list">
          <ul className="wl" aria-label="Lista ćwiczeń">
            {items.map((it, i) => {
              const ex = exercises[i];
              const p = progress[i] ?? { completed: 0, total: 0 };
              const done = isExerciseDone(p);
              const started = p.completed > 0;
              return (
                <li
                  key={it.exerciseId}
                  ref={(el) => { rowRefs.current[i] = el; }}
                  className={`wl-item${drag?.from === i ? ' wl-item--drag' : ''}`}
                  style={drag?.from === i ? { transform: `translateY(${drag.dy}px)` } : undefined}
                >
                  <button
                    type="button"
                    className={`wl-row${done ? ' wl-row--done' : started ? ' wl-row--active' : ''}${i === current ? ' wl-row--current' : ''}`}
                    aria-current={i === current ? 'true' : undefined}
                    onClick={() => openFromList(i)}
                  >
                    {ex ? <ExerciseThumb exercise={ex} size={56} /> : <span style={{ width: 56, height: 56 }} />}
                    <span className="wl-row__text">
                      <span className="wl-row__name">{ex?.name ?? 'Nieznane ćwiczenie'}</span>
                      {ex?.namePl && <span className="wl-row__pl">{ex.namePl}</span>}
                      <span className="wl-row__progress">
                        {p.completed}/{p.total} {setsWord(p.total)}
                        {done && ' · Zrobione'}
                      </span>
                    </span>
                    {done && (
                      <span className="wl-row__badge" role="img" aria-label="Zrobione">
                        <Check size={18} strokeWidth={3} aria-hidden="true" />
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="wl-handle"
                    aria-label="Przeciągnij, aby zmienić kolejność"
                    onPointerDown={(e) => onHandleDown(e, i)}
                    onPointerMove={onHandleMove}
                    onPointerUp={(e) => onHandleUp(e, true)}
                    onPointerCancel={(e) => onHandleUp(e, false)}
                  >
                    <GripVertical size={22} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="workout-add" onClick={() => setSheet({ kind: 'add' })}>
            + Dodaj ćwiczenie
          </button>
          {items.length > 0 && progress.every(isExerciseDone) && (
            <button type="button" className="wl-finish" onClick={() => setSheet({ kind: 'finish' })}>
              Zakończ trening
            </button>
          )}
        </div>
      )}

      <div className={`workout-pager${view === 'list' ? ' workout-pager--hidden' : ''}`} ref={pager} onScroll={onScroll} inert={view === 'list'}>
        {items.length === 0 && (
          <div className="workout-page workout-page--empty">
            <p>Pusty trening. Dodaj pierwsze ćwiczenie.</p>
            <button type="button" className="plan-btn plan-btn--primary" onClick={() => setSheet({ kind: 'add' })}>
              Dodaj ćwiczenie
            </button>
          </div>
        )}
        {items.map((it, i) => {
          const ex = exercises[i];
          return (
            <div className="workout-page" key={it.exerciseId} inert={i !== current}>
              <ExercisePanel
                workoutId={workout.id}
                index={i}
                item={it}
                exercise={ex}
                sets={setsByExercise.get(it.exerciseId) ?? []}
                lastSets={lastSets[it.exerciseId] ?? []}
                note={notes[i]?.text}
                step={ex?.weightStep ?? settings.defaultWeightStep}
                barWeight={settings.barWeight}
                plates={settings.plates}
                effort={settings.effortTarget}
                stagnating={isStagnating(recent[it.exerciseId] ?? [])}
                showRir={settings.showRir}
                restSoundPreset={settings.restSoundPreset}
                restVibration={settings.restVibration}
                askDifficulty={settings.showRir && settings.askDifficultyAfterSet}
                onInfo={(tab) => setSheet({ kind: 'info', tab })}
                onConfirmRemoveSet={(set) => setSheet({ kind: 'remove-set', set })}
                onExerciseDone={onExerciseDone}
              />
              {i === items.length - 1 && (
                <button type="button" className="workout-add" onClick={() => setSheet({ kind: 'add' })}>
                  + Dodaj ćwiczenie
                </button>
              )}
            </div>
          );
        })}
      </div>

      <RestBar
        workoutId={workout.id}
        restEndsAt={workout.restEndsAt}
        restTotalSec={workout.restTotalSec}
        preset={settings.restSoundPreset}
        ticks={settings.restTicks}
        vibration={settings.restVibration}
        onEnd={onRestEnd}
      />
      {banner && <RestEndBanner onDismiss={hideBanner} />}

      {sheet?.kind === 'menu' && (
        <ActionSheet
          title="Opcje treningu"
          onCancel={close}
          actions={[
            { label: 'Dodaj ćwiczenie', kind: 'primary', onClick: () => setSheet({ kind: 'add' }) },
            ...(currentItem
              ? [
                  {
                    label: `Zamień: ${currentName}`,
                    onClick: () => setSheet(currentHasDone ? { kind: 'swap-refused' } : { kind: 'swap' }),
                  },
                  ...(current > 0
                    ? [{ label: `Przesuń wyżej: ${currentName}`, onClick: () => { close(); void reorder(current, current - 1); } }]
                    : []),
                  ...(current < items.length - 1
                    ? [{ label: `Przesuń niżej: ${currentName}`, onClick: () => { close(); void reorder(current, current + 1); } }]
                    : []),
                  { label: `Usuń: ${currentName}`, onClick: () => setSheet({ kind: 'remove-exercise' }) },
                ]
              : []),
            { label: 'Anuluj trening', kind: 'danger' as const, onClick: () => setSheet({ kind: 'discard' }) },
            { label: 'Zamknij', onClick: close },
          ]}
        />
      )}
      {sheet?.kind === 'finish' && (
        <ActionSheet
          title="Zakończyć trening?"
          message="Niezaliczone serie nie zostaną zapisane."
          onCancel={close}
          actions={[
            { label: 'Zakończ trening', kind: 'primary', onClick: () => void finish() },
            { label: 'Ćwiczę dalej', onClick: close },
          ]}
        />
      )}
      {sheet?.kind === 'empty' && (
        <ActionSheet
          title="Brak zaliczonych serii"
          message="Nie ma czego zapisać. Usunąć ten trening?"
          onCancel={close}
          actions={[
            { label: 'Usuń trening', kind: 'danger', onClick: () => void discard() },
            { label: 'Ćwiczę dalej', onClick: close },
          ]}
        />
      )}
      {sheet?.kind === 'discard' && (
        <ActionSheet
          title="Anulować trening?"
          message="Trening i wszystkie jego serie zostaną usunięte."
          onCancel={close}
          actions={[
            { label: 'Usuń trening', kind: 'danger', onClick: () => void discard() },
            { label: 'Wróć', onClick: close },
          ]}
        />
      )}
      {sheet?.kind === 'remove-exercise' && currentItem && (
        <ActionSheet
          title={`Usunąć ${currentName}?`}
          message={currentHasDone ? 'Zaliczone serie tego ćwiczenia też zostaną usunięte.' : undefined}
          onCancel={close}
          actions={[
            {
              label: 'Usuń ćwiczenie',
              kind: 'danger',
              onClick: () => {
                close();
                void removeExercise(workout.id, current).then(() => setIndex(Math.max(0, current - (current === items.length - 1 ? 1 : 0))));
              },
            },
            { label: 'Wróć', onClick: close },
          ]}
        />
      )}
      {sheet?.kind === 'remove-set' && (
        <ActionSheet
          title="Usunąć zaliczoną serię?"
          onCancel={close}
          actions={[
            { label: 'Usuń serię', kind: 'danger', onClick: () => { close(); void removeSet(sheet.set.id); } },
            { label: 'Wróć', onClick: close },
          ]}
        />
      )}
      {sheet?.kind === 'swap-refused' && (
        <ActionSheet
          title="Nie można zamienić"
          message="To ćwiczenie ma już zaliczone serie. Dodaj nowe ćwiczenie zamiast zamieniać."
          onCancel={close}
          actions={[
            { label: 'Dodaj ćwiczenie', kind: 'primary', onClick: () => setSheet({ kind: 'add' }) },
            { label: 'Wróć', onClick: close },
          ]}
        />
      )}
      {sheet?.kind === 'add' && (
        <ExercisePicker
          existingIds={items.map((i) => i.exerciseId)}
          existingLabel="W treningu"
          onDone={(ids) => addExercises(workout.id, ids)}
          onClose={close}
        />
      )}
      {sheet?.kind === 'swap' && currentItem && (
        <ExercisePicker
          title={`Zamień: ${currentName}`}
          replacing={currentItem.exerciseId}
          single
          existingIds={items.map((i) => i.exerciseId)}
          existingLabel="W treningu"
          onDone={([id]) => swapExercise(workout.id, current, id)}
          onClose={close}
        />
      )}
      {sheet?.kind === 'info' && currentItem && (
        <ExerciseInfoSheet
          exerciseId={currentItem.exerciseId}
          exerciseName={currentName}
          workoutId={workout.id}
          tab={sheet.tab}
          onTab={(tab) => setSheet({ kind: 'info', tab })}
          onClose={close}
        />
      )}
    </div>
  );
}
