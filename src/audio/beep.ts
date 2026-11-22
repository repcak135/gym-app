// End-of-rest sound.
//
// iOS: audio only plays from a context unlocked by a tap, so unlockAudio() runs on
// "Rozpocznij trening" / "Zalicz serię". The ring/silent switch mutes web audio unless
// the page's audio session is 'playback' (Safari 17+, navigator.audioSession). 'playback'
// also pauses other apps' music, so it is switched on only for the ~1 s alarm and set
// back to 'auto' right after. 'transient' would duck music but still obey the switch.
//
// Elsewhere (Android, desktop): no audio session API; the alarm is scheduled ahead on
// the audio clock so it plays on time even if JS timers are throttled.

type AudioSessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record';
type NavigatorWithSession = Navigator & { audioSession?: { type: AudioSessionType } };

let ctx: AudioContext | null = null;
let unlocked = false;
let scheduled: OscillatorNode[] = [];
let restoreTimer: ReturnType<typeof setTimeout> | undefined;

function session() {
  return (navigator as NavigatorWithSession).audioSession;
}

/** True where the alarm must be played live (iOS), not scheduled ahead. */
export function playsLive(): boolean {
  return session() !== undefined;
}

function setSessionType(type: AudioSessionType): void {
  const s = session();
  if (!s) return;
  try {
    if (s.type !== type) s.type = type;
  } catch {
    // older Safari: read-only or unsupported value
  }
}

/** Call from a tap. Creates/resumes the context and plays a silent buffer (iOS unlock). */
export function unlockAudio(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === 'running' && unlocked) return;
    unlocked = true;
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    ctx = null;
  }
}

if (typeof document !== 'undefined') {
  // iOS suspends the context in the background; try to bring it back on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') void ctx.resume().catch(() => {});
  });
}

export function cancelScheduled(): void {
  for (const osc of scheduled) {
    try {
      osc.stop();
    } catch {
      // already stopped
    }
  }
  scheduled = [];
}

function tone(at: number, freq: number, dur: number, volume: number, type: OscillatorType): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
  gain.gain.setValueAtTime(volume, at + dur - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
  scheduled.push(osc);
}

/** Three rising, loud beeps starting at audio time t0 (~0.9 s). */
function alarmAt(t0: number): void {
  const notes = [880, 1175, 1568];
  notes.forEach((f, i) => {
    const at = t0 + i * 0.3;
    tone(at, f, 0.24, 0.9, 'square');
    tone(at, f * 2, 0.24, 0.25, 'sine');
  });
}

function tickAt(t: number): void {
  tone(t, 660, 0.07, 0.25, 'sine');
}

/** Non-iOS: schedule ticks at −3/−2/−1 s and the alarm at `endMs` on the audio clock. */
export function scheduleRestSound(endMs: number, ticks: boolean): void {
  cancelScheduled();
  if (!ctx || playsLive()) return;
  const delay = (endMs - Date.now()) / 1000;
  if (delay < 0) return;
  const t0 = ctx.currentTime + delay;
  if (ticks) for (const s of [3, 2, 1]) if (delay - s > 0) tickAt(t0 - s);
  alarmAt(t0);
}

/** iOS: a soft tick now (obeys the silent switch, does not touch music). */
export function playTick(): void {
  if (!ctx || !playsLive()) return;
  if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  tickAt(ctx.currentTime + 0.01);
}

/** iOS: play the alarm now, through the silent switch, then hand audio back to other apps. */
export async function playAlarmNow(): Promise<void> {
  if (!ctx) return;
  if (restoreTimer) clearTimeout(restoreTimer);
  try {
    // The category change takes effect when the context (re)starts.
    await ctx.suspend().catch(() => {});
    setSessionType('playback');
    await ctx.resume().catch(() => {});
    alarmAt(ctx.currentTime + 0.05);
  } finally {
    restoreTimer = setTimeout(() => {
      restoreTimer = undefined;
      setSessionType('auto');
    }, 1300);
  }
}

export function vibrateRestEnd(): void {
  try {
    navigator.vibrate?.([300, 120, 300, 120, 600]);
  } catch {
    // unsupported (iOS)
  }
}
