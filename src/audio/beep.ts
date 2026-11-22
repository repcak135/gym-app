// End-of-rest sound. iOS only plays audio from a context unlocked by a tap, so
// unlockAudio() is called from the "Zalicz serię" tap, and the beep is scheduled
// on the audio clock right away (it plays even if JS timers are throttled).

let ctx: AudioContext | null = null;
let scheduled: OscillatorNode[] = [];

export function unlockAudio(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function cancelBeep(): void {
  for (const osc of scheduled) {
    try {
      osc.stop();
    } catch {
      // already stopped
    }
  }
  scheduled = [];
}

/** Three short beeps at the wall-clock time `atMs`. */
export function scheduleBeep(atMs: number): void {
  cancelBeep();
  if (!ctx) return;
  const delay = (atMs - Date.now()) / 1000;
  if (delay < 0) return;
  const t0 = ctx.currentTime + delay;
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = i === 2 ? 1320 : 880;
    const start = t0 + i * 0.28;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.5, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.22);
    scheduled.push(osc);
  }
}

export function vibrate(): void {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    // unsupported (iOS)
  }
}
