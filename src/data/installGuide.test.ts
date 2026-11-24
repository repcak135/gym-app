import { describe, expect, it } from 'vitest';
import { SNOOZE_MS, detectPlatform, guideDue, isOtherIosBrowser } from './installGuide';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

describe('detectPlatform', () => {
  it('iPhone (Safari and Chrome)', () => {
    expect(detectPlatform(IPHONE_SAFARI)).toBe('ios');
    expect(detectPlatform(IPHONE_CHROME)).toBe('ios');
    expect(isOtherIosBrowser(IPHONE_CHROME)).toBe(true);
    expect(isOtherIosBrowser(IPHONE_SAFARI)).toBe(false);
  });
  it('iPad looks like a Mac but has touch', () => {
    expect(detectPlatform(IPAD, 5)).toBe('ios');
    expect(detectPlatform(IPAD, 0)).toBe('desktop');
  });
  it('Android and computer', () => {
    expect(detectPlatform(ANDROID)).toBe('android');
    expect(detectPlatform(WINDOWS)).toBe('desktop');
  });
});

describe('guideDue', () => {
  const now = 1_000_000_000_000;
  it('shows on first visit', () => expect(guideDue(null, now)).toBe(true));
  it('"Mam już zainstalowaną" hides it for good', () => expect(guideDue('never', now)).toBe(false));
  it('"Nie teraz" hides it for 7 days', () => {
    const until = String(now + SNOOZE_MS);
    expect(guideDue(until, now + SNOOZE_MS - 1)).toBe(false);
    expect(guideDue(until, now + SNOOZE_MS)).toBe(true);
  });
  it('garbage counts as not set', () => expect(guideDue('abc', now)).toBe(true));
});
