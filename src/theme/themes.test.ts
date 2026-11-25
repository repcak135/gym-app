import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEMES, applyTheme, getTheme, isThemeId, setTheme } from './themes';

describe('themes', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('defaults to banana when nothing or garbage is stored', () => {
    expect(getTheme()).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME).toBe('banana');
    localStorage.setItem('gym.theme', 'neon');
    expect(getTheme()).toBe('banana');
  });

  it('remembers the choice and puts it on <html>', () => {
    setTheme('blue');
    expect(getTheme()).toBe('blue');
    expect(document.documentElement.dataset.theme).toBe('blue');
    delete document.documentElement.dataset.theme;
    applyTheme();
    expect(document.documentElement.dataset.theme).toBe('blue');
  });

  it('has unique ids and no green or red accent', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(THEMES.every((t) => isThemeId(t.id))).toBe(true);
    expect(THEMES.map((t) => t.accent)).not.toContain('#34d399');
    expect(THEMES.map((t) => t.accent)).not.toContain('#f25f5c');
  });
});
