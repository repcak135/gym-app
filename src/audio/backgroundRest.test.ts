import { describe, it, expect } from 'vitest';
import { isAndroid, isIOS, restWav } from './backgroundRest';

const RATE = 8000;
const loud = (wav: Uint8Array, fromSec: number, toSec: number) => {
  let max = 0;
  for (let i = 44 + Math.floor(fromSec * RATE); i < Math.min(wav.length, 44 + toSec * RATE); i++) max = Math.max(max, Math.abs(wav[i] - 128));
  return max;
};

describe('plik przerwy (Graj w tle)', () => {
  it('nagłówek WAV 8 kHz 8-bit mono, długość = przerwa + dźwięk', () => {
    const wav = restWav(60, 'bell', false);
    const txt = (o: number) => String.fromCharCode(...wav.slice(o, o + 4));
    expect(txt(0)).toBe('RIFF');
    expect(txt(8)).toBe('WAVE');
    const view = new DataView(wav.buffer);
    expect(view.getUint32(24, true)).toBe(RATE);
    expect(view.getUint16(34, true)).toBe(8);
    expect(view.getUint32(40, true)).toBe(wav.length - 44);
    expect((wav.length - 44) / RATE).toBeGreaterThan(61);
    expect((wav.length - 44) / RATE).toBeLessThan(62);
  });

  it('cisza przez całą przerwę, dźwięk dopiero na końcu; tyknięcia 3-2-1 przed końcem', () => {
    const wav = restWav(30, 'beeps', true);
    expect(loud(wav, 0, 26.9)).toBe(0);
    expect(loud(wav, 27, 27.1)).toBeGreaterThan(10); // tick at -3 s
    expect(loud(wav, 30, 30.3)).toBeGreaterThan(50); // the end sound
    const quiet = restWav(30, 'beeps', false);
    expect(loud(quiet, 0, 29.9)).toBe(0);
  });

  it('rozpoznaje Androida i iPhone’a', () => {
    expect(isAndroid('Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/131 Mobile')).toBe(true);
    expect(isAndroid('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(false);
    expect(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true);
  });
});
