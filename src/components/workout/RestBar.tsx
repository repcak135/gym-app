import { useEffect, useRef } from 'react';
import { useNow } from '../../hooks/useNow';
import { formatClock, restRemainingSec } from '../../data/progression';
import { extendRest, skipRest } from '../../data/workouts';
import { cancelBeep, scheduleBeep, vibrate } from '../../audio/beep';

interface RestBarProps {
  workoutId: string;
  restEndsAt?: number;
  restTotalSec?: number;
}

/** Rest countdown from the stored end time, so it is right after the app was in the background. */
export default function RestBar({ workoutId, restEndsAt, restTotalSec }: RestBarProps) {
  const now = useNow(250, restEndsAt !== undefined);
  const remaining = restRemainingSec(restEndsAt, now);
  const alerted = useRef<number | undefined>(undefined);

  // Sound is scheduled on the audio clock whenever the end time changes or the app comes back.
  useEffect(() => {
    if (restEndsAt === undefined) {
      cancelBeep();
      return;
    }
    scheduleBeep(restEndsAt);
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleBeep(restEndsAt);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [restEndsAt]);

  useEffect(() => () => cancelBeep(), []);

  // Vibrate once when the rest ends while the app is open (not when it ended long ago).
  useEffect(() => {
    if (restEndsAt === undefined || remaining > 0 || alerted.current === restEndsAt) return;
    alerted.current = restEndsAt;
    if (now - restEndsAt < 3000) vibrate();
  }, [remaining, restEndsAt, now]);

  if (restEndsAt === undefined || remaining <= 0) return null;

  const total = Math.max(restTotalSec ?? remaining, remaining);
  const progress = total > 0 ? 1 - remaining / total : 1;

  return (
    <div className="rest-bar" role="timer" aria-label="Przerwa">
      <div className="rest-bar__track" aria-hidden="true">
        <div className="rest-bar__fill" style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div className="rest-bar__row">
        <span className="rest-bar__label">Przerwa</span>
        <span className="rest-bar__time">{formatClock(remaining)}</span>
        <button type="button" className="rest-bar__btn" onClick={() => void extendRest(workoutId, 15)}>
          +15 s
        </button>
        <button type="button" className="rest-bar__btn rest-bar__btn--skip" onClick={() => void skipRest(workoutId)}>
          Pomiń
        </button>
      </div>
    </div>
  );
}
