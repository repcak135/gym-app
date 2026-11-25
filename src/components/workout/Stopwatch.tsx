import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../../data/measure';
import { playAlarmNow, presetHasSound, unlockAudio, vibrateRestEnd } from '../../audio/beep';
import type { RestSoundPreset } from '../../data/types';

interface Props {
  /** Target in seconds; the end sound plays once when it is reached. */
  targetSec?: number;
  preset: RestSoundPreset;
  vibration: boolean;
  /** Called with the elapsed whole seconds when the user taps Stop. */
  onStop: (sec: number) => void;
}

/** Count-up timer based on Date.now() deltas, so it stays right when the app was in the background. */
export default function Stopwatch({ targetSec, preset, vibration, onStop }: Props) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedMs, setStoppedMs] = useState(0);
  const [, setTick] = useState(0);
  const alarmed = useRef(false);

  const running = startedAt !== null;
  const elapsedMs = running ? Date.now() - startedAt : stoppedMs;
  const elapsedSec = Math.floor(elapsedMs / 1000);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [running]);

  const reached = running && targetSec !== undefined && targetSec > 0 && elapsedSec >= targetSec;
  useEffect(() => {
    if (!reached || alarmed.current) return;
    alarmed.current = true;
    if (presetHasSound(preset)) void playAlarmNow(preset);
    if (vibration) vibrateRestEnd();
  }, [reached, preset, vibration]);

  const start = () => {
    unlockAudio();
    alarmed.current = false;
    setStoppedMs(0);
    setStartedAt(Date.now());
  };
  const stop = () => {
    if (startedAt === null) return;
    const ms = Date.now() - startedAt;
    setStoppedMs(ms);
    setStartedAt(null);
    onStop(Math.round(ms / 1000));
  };

  return (
    <div className="stopwatch" role="group" aria-label="Stoper">
      <output className="stopwatch__time" aria-label="Czas stopera">{formatDuration(elapsedSec)}</output>
      {targetSec !== undefined && targetSec > 0 && <span className="stopwatch__target">cel {formatDuration(targetSec)}</span>}
      <div className="stopwatch__buttons">
        {running ? (
          <button type="button" className="stopwatch__btn stopwatch__btn--stop" onClick={stop}>Stop</button>
        ) : (
          <>
            <button type="button" className="stopwatch__btn stopwatch__btn--start" onClick={start}>Start</button>
            {stoppedMs > 0 && (
              <button type="button" className="stopwatch__btn" onClick={() => setStoppedMs(0)}>Wyzeruj</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
