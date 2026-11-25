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
import { backgroundCovers, startBackgroundRest, stopBackgroundRest, stopBackgroundRestIfPending } from '../../audio/backgroundRest';
import type { RestSoundPreset } from '../../data/types';

interface RestBarProps {
  workoutId: string;
  restEndsAt?: number;
  restTotalSec?: number;
  preset: RestSoundPreset;
  /** Soft 3-2-1 ticks (only with a sound preset). */
  ticks: boolean;
  vibration: boolean;
  /** Android "Graj w tle": the rest plays as one audio file with the end sound inside. */
  background?: boolean;
  /** Rest is over. `lateMs` > 0: it ended that long ago, while the app was hidden or closed. */
  onEnd: (lateMs: number) => void;
}

/** A rest that ended more than this long ago is "late": the banner says how long ago. */
const LATE_MS = 3000;
/**
 * Coming back to the app (iPhone suspends it when locked) up to this long after the rest
 * ended still plays the end sound once; later (e.g. reopened the next day) only the banner.
 */
const RETURN_ALERT_MS = 15 * 60 * 1000;

/** Rest countdown from the stored end time, so it is right after the app was in the background. */
export default function RestBar({ workoutId, restEndsAt, restTotalSec, preset, ticks, vibration, background = false, onEnd }: RestBarProps) {
  const sound = presetHasSound(preset);
  const vibrate = vibration || preset === 'vibrate';
  const tickOn = ticks && sound;
  const now = useNow(250, restEndsAt !== undefined);
  const remaining = restRemainingSec(restEndsAt, now);
  const handled = useRef<number | undefined>(undefined);
  const ticked = useRef<string>('');

  // Android "Graj w tle": one audio file that keeps playing with the screen off.
  const bgOn = background && sound && restEndsAt !== undefined && !playsLive();
  useEffect(() => {
    if (!bgOn || restEndsAt === undefined) return;
    startBackgroundRest(restEndsAt, preset, tickOn);
    // A new end time (+15 s) restarts it; a rest that is over keeps its end sound playing.
    return () => stopBackgroundRestIfPending();
  }, [bgOn, restEndsAt, preset, tickOn]);

  // Android/desktop: ticks + alarm scheduled ahead on the audio clock (unless the file above plays them).
  useEffect(() => {
    if (restEndsAt === undefined || !sound || bgOn) {
      cancelScheduled();
      return;
    }
    scheduleRestSound(restEndsAt, tickOn, preset);
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleRestSound(restEndsAt, tickOn, preset);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [restEndsAt, sound, tickOn, preset, bgOn]);

  useEffect(() => () => {
    cancelScheduled();
    stopBackgroundRestIfPending();
  }, []);

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
    const lateMs = Date.now() - restEndsAt;
    const late = lateMs > LATE_MS;
    if (!late) {
      if (sound && playsLive()) void playAlarmNow(preset);
      if (vibrate) vibrateRestEnd();
    } else if (lateMs <= RETURN_ALERT_MS && !backgroundCovers(restEndsAt)) {
      // Back in the app after the rest ended (the scheduled sound may not have played): once now.
      cancelScheduled();
      if (sound) void playAlarmNow(preset);
      if (vibrate) vibrateRestEnd();
    }
    onEnd(late ? lateMs : 0);
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
            stopBackgroundRest();
            void skipRest(workoutId);
          }}
        >
          Pomiń
        </button>
      </div>
    </div>
  );
}

/** "0:45 temu" for a rest that ended while the app was hidden. */
export function endedAgoText(lateMs: number): string {
  const sec = Math.floor(lateMs / 1000);
  return sec >= 3600 ? 'Przerwa skończyła się ponad godzinę temu' : `Przerwa skończyła się ${formatClock(sec)} temu`;
}

/** Big "Koniec przerwy!" with a short screen flash; tap or wait to dismiss. */
export function RestEndBanner({ lateMs = 0, onDismiss }: { lateMs?: number; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, lateMs > 0 ? 8000 : 5000);
    return () => clearTimeout(id);
  }, [onDismiss, lateMs]);
  return (
    <button type="button" className="rest-end" role="alert" onClick={onDismiss}>
      <span className="rest-end__flash" aria-hidden="true" />
      <span className="rest-end__card">
        <span className="rest-end__title">Koniec przerwy!</span>
        {lateMs > 0 && <span className="rest-end__ago">{endedAgoText(lateMs)}</span>}
        <span className="rest-end__hint">Dotknij, aby zamknąć</span>
      </span>
    </button>
  );
}
