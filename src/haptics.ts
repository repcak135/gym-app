/** Short vibration pulses (Android; iPhone Safari has no vibration API). Off with Ustawienia > Wibracja. */
let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

const PATTERNS = {
  tick: 12,
  delete: [8, 40, 16],
} as const;

export function haptic(kind: keyof typeof PATTERNS): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(PATTERNS[kind] as number | number[]);
  } catch {
    // some browsers throw before a user gesture; a missed pulse is harmless
  }
}

/** 0 when the user asked for reduced motion, so JS waits match the (disabled) CSS animations. */
export function motionMs(ms: number): number {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms;
}
