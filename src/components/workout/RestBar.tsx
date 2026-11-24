import { useEffect, useRef } from 'react';
import { useNow } from '../../hooks/useNow';
import { formatClock, restRemainingSec } from '../../data/progression';
import { extendRest, skipRest } from '../../data/workouts';
import {
  cancelScheduled,
  playAlarmNow,
  playTick,
  playsLive,
  presetHasSound,
  scheduleRestSound,
  vibrateRestEnd,
} from '../../audio/beep';
import type { RestSoundPreset } from '../../data/types';

interface RestBarProps {
  workoutId: string;
  restEndsAt?: number;
  restTotalSec?: number;
  preset: RestSoundPreset;
  /** Soft 3-2-1 ticks (only with a sound preset). */
  ticks: boolean;
  vibration: boolean;
  /** Rest is over. `late` = it ended while the app was hidden or closed. */
  onEnd: (late: boolean) => void;
}

/** A rest that ended more than this long ago is "late": banner only, no sound/vibration. */
const LATE_MS = 3000;

/** Rest countdown from the stored end time, so it is right after the app was in the background. */
export default function RestBar({ workoutId, restEndsAt, restTotalSec, preset, ticks, vibration, onEnd }: RestBarProps) {
  const sound = presetHasSound(preset);
  const vibrate = vibration || preset === 'vibrate';
  const tickOn = ticks && sound;
  const now = useNow(250, restEndsAt !== undefined);
  const remaining = restRemainingSec(restEndsAt, now);
  const handled = useRef<number | undefined>(undefined);
  const ticked = useRef<string>('');

  // Android/desktop: ticks + alarm scheduled ahead on the audio clock.
  useEffect(() => {
    if (restEndsAt === undefined || !sound) {
      cancelScheduled();
      return;
    }
    scheduleRestSound(restEndsAt, tickOn, preset);
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleRestSound(restEndsAt, tickOn, preset);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [restEndsAt, sound, tickOn, preset]);

  useEffect(() => () => cancelScheduled(), []);

  // iOS: soft ticks at 3-2-1 s, played live.
  useEffect(() => {
    if (!tickOn || !playsLive() || restEndsAt === undefined) return;
    if (remaining >= 1 && remaining <= 3) {
      const key = `${restEndsAt}:${remaining}`;
      if (ticked.current !== key) {
        ticked.current = key;
        playTick();
      }
    }
  }, [remaining, restEndsAt, tickOn]);

  // End of rest: alert once, then clear the rest so a reload does not alert again.
  useEffect(() => {
    if (restEndsAt === undefined || remaining > 0 || handled.current === restEndsAt) return;
    if (document.visibilityState !== 'visible') return; // handled when the app comes back
    handled.current = restEndsAt;
    const late = Date.now() - restEndsAt > LATE_MS;
    if (!late) {
      if (sound && playsLive()) void playAlarmNow(preset);
      if (vibrate) vibrateRestEnd();
    }
    onEnd(late);
    void skipRest(workoutId);
  }, [remaining, restEndsAt, sound, preset, vibrate, onEnd, workoutId]);

  if (restEndsAt === undefined || remaining <= 0) return null;

  const total = Math.max(restTotalSec ?? remaining, remaining);
  const progress = total > 0 ? 1 - remaining / total : 1;

  return (
    <div className={`rest-bar${remaining <= 3 ? ' rest-bar--ending' : ''}`} role="timer" aria-label="Przerwa">
      <div className="rest-bar__track" aria-hidden="true">
        <div className="rest-bar__fill" style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div className="rest-bar__row">
        <span className="rest-bar__label">Przerwa</span>
        <span className="rest-bar__time">{formatClock(remaining)}</span>
        <button type="button" className="rest-bar__btn" onClick={() => void extendRest(workoutId, 15)}>
          +15 s
        </button>
        <button
          type="button"
          className="rest-bar__btn rest-bar__btn--skip"
          onClick={() => {
            handled.current = restEndsAt; // skipped on purpose: no alert
            cancelScheduled();
            void skipRest(workoutId);
          }}
        >
          Pomiń
        </button>
      </div>
    </div>
  );
}

/** Big "Koniec przerwy!" with a short screen flash; tap or wait to dismiss. */
export function RestEndBanner({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 5000);
    return () => clearTimeout(id);
  }, [onDismiss]);
  return (
    <button type="button" className="rest-end" role="alert" onClick={onDismiss}>
      <span className="rest-end__flash" aria-hidden="true" />
      <span className="rest-end__card">
        <span className="rest-end__title">Koniec przerwy!</span>
        <span className="rest-end__hint">Dotknij, aby zamknąć</span>
      </span>
    </button>
  );
}
