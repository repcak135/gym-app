// "Graj w tle (eksperymentalne)", Android only.
//
// Chrome on Android throttles and then freezes a hidden page (screen off): JS timers stop
// and the Web Audio alarm scheduled ahead may never play. Media elements keep playing in
// the background there, so for the rest we play ONE audio file: silence for the rest's
// length with the 3-2-1 ticks and the end sound already inside it. Nothing has to run in
// JS at the end. Costs: a media notification while it plays, more battery, and Android
// gives it audio focus, which can pause music from other apps.
//
// iPhone: Home Screen apps stop all audio when locked (WebKit bugs 198277, 173332), so
// this is not offered there.

import type { RestSoundPreset } from '../data/types';
import { presetHasSound } from './beep';

export function isAndroid(ua: string = navigator.userAgent): boolean {
  return /Android/i.test(ua);
}

export function isIOS(ua: string = navigator.userAgent): boolean {
  return /iPhone|iPad|iPod/i.test(ua);
}

const RATE = 8000;
/** Longer rests are not padded (memory); the page-side alarm still covers them on return. */
const MAX_SILENCE_SEC = 600;

type Partial = { at: number; freq: number; dur: number; vol: number; decay: boolean };

/** The presets of beep.ts as plain sine partials (seconds from the end of the rest). */
function alarmPartials(preset: RestSoundPreset): Partial[] {
  const ring = (at: number, freq: number, dur: number, vol: number): Partial => ({ at, freq, dur, vol, decay: true });
  const tone = (at: number, freq: number, dur: number, vol: number): Partial => ({ at, freq, dur, vol, decay: false });
  switch (preset) {
    case 'bell':
      return [0, 0.45].flatMap((h) => [ring(h, 1046, 1.2, 0.3), ring(h, 2887, 0.6, 0.08)]);
    case 'gong':
      return [ring(0, 110, 2, 0.5), ring(0, 174, 1.6, 0.18), ring(0, 266, 1.2, 0.12), ring(0, 407, 0.8, 0.06)];
    case 'twoTones':
      return [tone(0, 660, 0.18, 0.4), tone(0.2, 880, 0.18, 0.4)];
    case 'beeps':
      return [880, 1175, 1568].map((f, i) => tone(i * 0.3, f, 0.24, 0.6));
    default:
      return [];
  }
}

/**
 * 8 kHz 8-bit mono WAV: `silenceSec` of silence (ticks at −3/−2/−1 s when `ticks`),
 * then the preset's end sound.
 */
export function restWav(silenceSec: number, preset: RestSoundPreset, ticks: boolean): Uint8Array {
  const lead = Math.max(0, Math.min(silenceSec, MAX_SILENCE_SEC));
  const partials = [
    ...(ticks ? [3, 2, 1].filter((s) => s < lead).map((s): Partial => ({ at: -s, freq: 660, dur: 0.07, vol: 0.25, decay: false })) : []),
    ...alarmPartials(preset),
  ];
  const tail = Math.max(0, ...partials.map((p) => p.at + p.dur)) + 0.1;
  const n = Math.round((lead + tail) * RATE);
  const out = new Uint8Array(44 + n);
  const view = new DataView(out.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); view.setUint32(4, 36 + n, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true); view.setUint32(28, RATE, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  str(36, 'data'); view.setUint32(40, n, true);
  out.fill(128, 44);

  // Mix only the short sounding part near the end.
  const first = Math.max(0, Math.floor((lead + Math.min(0, ...partials.map((p) => p.at))) * RATE));
  const mix = new Float32Array(n - first);
  for (const p of partials) {
    const start = Math.round((lead + p.at) * RATE);
    const len = Math.round(p.dur * RATE);
    for (let i = 0; i < len; i++) {
      const t = i / RATE;
      const attack = Math.min(1, t / 0.01);
      const env = p.decay ? Math.exp((-5 * t) / p.dur) : Math.min(1, (p.dur - t) / 0.04);
      const k = start + i - first;
      if (k >= 0 && k < mix.length) mix[k] += p.vol * attack * env * Math.sin(2 * Math.PI * p.freq * t);
    }
  }
  for (let k = 0; k < mix.length; k++) out[44 + first + k] = Math.max(0, Math.min(255, Math.round(128 + 127 * mix[k])));
  return out;
}

let el: HTMLAudioElement | null = null;
let url: string | null = null;
let endsAt: number | undefined;
/** Seconds of silence before the end sound in the current file. */
let leadSec = 0;
/** The end sound was played to the end ('ended'), e.g. while the screen was off. */
let heard = false;

/** Starts the rest's audio file. False when not possible (no sound preset, rest too short, error). */
export function startBackgroundRest(endMs: number, preset: RestSoundPreset, ticks: boolean): boolean {
  stopBackgroundRest();
  const sec = (endMs - Date.now()) / 1000;
  if (!presetHasSound(preset) || sec < 1 || sec > MAX_SILENCE_SEC) return false;
  try {
    url = URL.createObjectURL(new Blob([restWav(sec, preset, ticks) as BlobPart], { type: 'audio/wav' }));
    el = new Audio(url);
    el.preload = 'auto';
    const mine = el;
    el.addEventListener('ended', () => {
      if (el !== mine) return;
      heard = true;
      release();
    });
    endsAt = endMs;
    leadSec = Math.min(sec, MAX_SILENCE_SEC);
    heard = false;
    if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'Przerwa', artist: 'Banana Gym' });
    }
    const playing = el.play();
    if (playing) void playing.catch(() => stopBackgroundRest());
    return true;
  } catch {
    stopBackgroundRest();
    return false;
  }
}

function release(): void {
  if (url) URL.revokeObjectURL(url);
  el = null;
  url = null;
}

/** Stops the file (rest skipped, changed or the workout left) and forgets it. */
export function stopBackgroundRest(): void {
  if (el) {
    try {
      el.pause();
    } catch {
      // ignore
    }
  }
  release();
  endsAt = undefined;
  heard = false;
}

/** Stops it only if its end sound has not started yet (keeps an alarm that is playing now). */
export function stopBackgroundRestIfPending(): void {
  if (endsAt !== undefined && Date.now() < endsAt - 200) stopBackgroundRest();
}

/** True when this rest's file got to its end sound (so it was already heard, maybe with the screen off). */
export function backgroundCovers(endMs: number): boolean {
  if (endsAt !== endMs) return false;
  return heard || (el !== null && (el.ended || el.currentTime >= leadSec - 0.3));
}

/** Test hook: is a rest file playing now? */
export function backgroundRestPlaying(): boolean {
  return el !== null && !el.paused;
}
