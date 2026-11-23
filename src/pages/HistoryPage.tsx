import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { listFinishedWorkouts, workoutDays, type WorkoutListItem } from '../data/history';
import { formatClock } from '../data/progression';
import { exercisesLabel, formatDay } from './planFormat';
import { MONTHS, MONTHS_GENITIVE, WEEKDAYS_SHORT, setsLabel } from './historyFormat';
import { removeWorkoutUndoable } from '../data/undoable';
import { showUndo } from '../undo';
import SwipeRow from '../components/SwipeRow';
import './HistoryPage.css';

const WEEK_HEADER = ['pn', 'wt', 'śr', 'cz', 'pt', 'so', 'nd'];

// Coming back from a workout's details returns to the month and day you were looking at.
let lastView: { year: number; month: number; day: number | null } | null = null;

export default function HistoryPage() {
  const items = useLiveQuery(() => listFinishedWorkouts(), []);
  const [now] = useState(() => new Date());
  const [view, setView] = useState(() =>
    lastView ? { year: lastView.year, month: lastView.month } : { year: now.getFullYear(), month: now.getMonth() },
  );
  const [selectedDay, setSelectedDay] = useState<number | null>(() => lastView?.day ?? null);
  useEffect(() => {
    lastView = { ...view, day: selectedDay };
  }, [view, selectedDay]);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const { year, month } = view;

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedDay(null);
  }

  const days = items ? workoutDays(items, year, month) : new Set<number>();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
  const isThisMonth = year === now.getFullYear() && month === now.getMonth();

  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const shown: WorkoutListItem[] = (items ?? []).filter(({ workout }) => {
    const d = new Date(workout.startedAt);
    if (d.getFullYear() !== year || d.getMonth() !== month) return false;
    return selectedDay === null || d.getDate() === selectedDay;
  });

  return (
    <article>
      <h1>Historia</h1>

      <section
        className="cal"
        aria-label="Kalendarz"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touchStart.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const s = touchStart.current;
          touchStart.current = null;
          if (!s) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - s.x;
          const dy = t.clientY - s.y;
          if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) shiftMonth(dx < 0 ? 1 : -1);
        }}
      >
        <div className="cal__head">
          <button type="button" className="icon-btn" aria-label="Poprzedni miesiąc" onClick={() => shiftMonth(-1)}>
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          <h2 className="cal__title">{MONTHS[month]} {year}</h2>
          <button type="button" className="icon-btn" aria-label="Następny miesiąc" onClick={() => shiftMonth(1)}>
            <ChevronRight size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="cal__grid cal__weekdays" aria-hidden="true">
          {WEEK_HEADER.map((w) => <span key={w}>{w}</span>)}
        </div>
        <div className="cal__grid">
          {cells.map((day, i) => {
            if (day === null) return <span key={`e${i}`} className="cal__cell" />;
            const today = isThisMonth && day === now.getDate();
            const cls = `cal__cell${today ? ' cal__cell--today' : ''}`;
            if (!days.has(day)) return <span key={day} className={cls}>{day}</span>;
            return (
              <button
                key={day}
                type="button"
                className={`${cls} cal__cell--has${selectedDay === day ? ' cal__cell--selected' : ''}`}
                aria-label={`${day} ${MONTHS_GENITIVE[month]}, trening`}
                aria-pressed={selectedDay === day}
                onClick={() => setSelectedDay(selectedDay === day ? null : day)}
              >
                {day}
                <span className="cal__dot" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>

      {selectedDay !== null && (
        <button type="button" className="history-chip" onClick={() => setSelectedDay(null)}>
          Cały miesiąc
        </button>
      )}

      {items && shown.length === 0 && <p className="history-empty">Brak treningów w tym miesiącu.</p>}

      {shown.length > 0 && (
        <ul className="history-list list-in" aria-label="Treningi">
          {shown.map(({ workout, sets, exercises, durationSec }, i) => (
            <li key={workout.id} style={{ '--i': i } as React.CSSProperties}>
              <SwipeRow
                label={`${workout.name}, ${formatDay(workout.startedAt)}`}
                onDelete={async () => {
                  const restore = await removeWorkoutUndoable(workout.id);
                  showUndo(`Usunięto trening „${workout.name}”`, restore);
                }}
              >
              <Link to={`/historia/${workout.id}`} className="history-item">
                <span className="history-item__date">
                  {WEEKDAYS_SHORT[new Date(workout.startedAt).getDay()]}, {formatDay(workout.startedAt)}
                  {workout.source === 'import' && <span className="history-badge">Import</span>}
                </span>
                <span className="history-item__name">{workout.name}</span>
                <span className="history-item__meta">
                  {setsLabel(sets)} · {exercisesLabel(exercises)}
                  {durationSec !== undefined && ` · ${formatClock(durationSec)}`}
                </span>
              </Link>
              </SwipeRow>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
