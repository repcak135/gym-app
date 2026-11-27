import { describe, expect, it } from 'vitest';
import { shouldAskPush } from './PushPrompt';

describe('shouldAskPush', () => {
  it('asks once on a phone with working push that never decided', () => {
    expect(shouldAskPush(undefined, 'ok', true)).toBe(true);
    expect(shouldAskPush({}, 'ok', true)).toBe(true);
  });

  it('does not ask when push is already on or the question was answered', () => {
    expect(shouldAskPush({ restPush: true }, 'ok', true)).toBe(false);
    expect(shouldAskPush({ pushPromptDone: true }, 'ok', true)).toBe(false);
  });

  it('does not ask in a browser tab, also where push works there (Android Chrome)', () => {
    expect(shouldAskPush({}, 'ok', false)).toBe(false);
  });

  it('does not ask in a Safari tab on iPhone or without push support', () => {
    expect(shouldAskPush({}, 'needs-install', false)).toBe(false);
    expect(shouldAskPush({}, 'unsupported', true)).toBe(false);
  });
});
