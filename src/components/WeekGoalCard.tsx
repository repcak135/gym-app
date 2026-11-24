import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { Flame } from 'lucide-react';
import { db } from '../data/db';
import { clampGoal, weekProgress } from '../data/motivation';
import { getSettings } from '../data/settings';
import { plural } from '../data/plural';
import './WeekGoalCard.css';

const R = 26;
const C = 2 * Math.PI * R;

function streakText(streak: number): string {
  if (streak === 0) return 'Seria: zacznij w tym tygodniu';
  return `Seria: ${streak} ${plural(streak, 'tydzień', 'tygodnie', 'tygodni')} z rzędu`;
}

/** Start screen: workouts this week against the weekly goal, and the week streak. */
export default function WeekGoalCard() {
  const [now] = useState(() => Date.now());
  const p = useLiveQuery(async () => {
    const [workouts, settings] = await Promise.all([db.workouts.toArray(), getSettings()]);
    return weekProgress(workouts, clampGoal(settings.weeklyGoal), now);
  }, [now]);
  if (!p) return null;
  const frac = Math.min(1, p.done / p.goal);
  const left = p.goal - p.done;
  return (
    <section className={p.met ? 'goal-card goal-card--met' : 'goal-card'} aria-label="Cel tygodnia">
      <svg className="goal-ring" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
        <circle className="goal-ring__track" cx="32" cy="32" r={R} />
        <circle
          className="goal-ring__fill"
          cx="32"
          cy="32"
          r={R}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          transform="rotate(-90 32 32)"
        />
        <text x="32" y="37" textAnchor="middle" className="goal-ring__text">
          {p.done}/{p.goal}
        </text>
      </svg>
      <div className="goal-card__body">
        <p className="goal-card__main">
          {p.done}/{p.goal} w tym tygodniu
        </p>
        <p className="goal-card__hint">
          {p.met ? 'Cel tygodnia zaliczony ✓' : `Jeszcze ${left} do celu`}
        </p>
        <p className="goal-card__streak">
          <Flame size={16} aria-hidden="true" /> {streakText(p.streak)}
        </p>
      </div>
      <Link to="/ustawienia" className="goal-card__edit">Zmień cel</Link>
    </section>
  );
}
