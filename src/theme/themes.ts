// Colour themes: the accent colour of buttons, links and highlights. A device setting (this
// browser only, like the install guide), kept out of backups. The dark background stays the same.

export type ThemeId = 'banana' | 'orange' | 'blue' | 'violet' | 'pink';

export interface Theme {
  id: ThemeId;
  label: string;
  /** Swatch shown in Ustawienia; same as the theme's --accent. */
  accent: string;
}

/** First = default. None is green or red, so "done" (green) and "delete" (red) stay distinct. */
export const THEMES: Theme[] = [
  { id: 'banana', label: 'Bananowy', accent: '#ffd23f' },
  { id: 'orange', label: 'Pomarańczowy', accent: '#ff7a45' },
  { id: 'blue', label: 'Niebieski', accent: '#5aa9ff' },
  { id: 'violet', label: 'Fioletowy', accent: '#a78bfa' },
  { id: 'pink', label: 'Różowy', accent: '#ff6fae' },
];

export const DEFAULT_THEME: ThemeId = 'banana';
const KEY = 'gym.theme';

export function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

export function getTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    return isThemeId(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Puts the theme on <html data-theme>; the colours live in tokens.css. */
export function applyTheme(id: ThemeId = getTheme()): void {
  document.documentElement.dataset.theme = id;
}

export function setTheme(id: ThemeId): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // private mode: still applies for this visit
  }
  applyTheme(id);
}
