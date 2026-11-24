// "Zainstaluj aplikację na telefonie": which system the guide opens on, whether the app already
// runs installed, and the guide's "Nie teraz" / "Mam już zainstalowaną" choice (this browser only).

export type GuidePlatform = 'ios' | 'android' | 'desktop';

export function detectPlatform(ua: string, maxTouchPoints = 0): GuidePlatform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS reports itself as a Mac; a Mac has no touch screen.
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/** Chrome / Firefox / Edge on iPhone: same steps, but the share button sits in the address bar. */
export function isOtherIosBrowser(ua: string): boolean {
  return /CriOS|FxiOS|EdgiOS/i.test(ua);
}

/** Running as the installed app (home-screen icon), not in a browser tab. */
export function isStandalone(): boolean {
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  } catch {
    // old browsers
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const KEY = 'gym.installGuide';
export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/** Stored value: "never" (installed) or the time until which "Nie teraz" hides it. */
export function guideDue(stored: string | null, now: number): boolean {
  if (stored === 'never') return false;
  const until = Number(stored);
  return !stored || !Number.isFinite(until) || now >= until;
}

export function readGuideState(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function snoozeGuide(now = Date.now()): void {
  try {
    localStorage.setItem(KEY, String(now + SNOOZE_MS));
  } catch {
    // storage blocked: the card simply comes back next time
  }
}

export function hideGuideForGood(): void {
  try {
    localStorage.setItem(KEY, 'never');
  } catch {
    // storage blocked
  }
}

// Android Chrome offers a one-tap install through this event; it can fire before React starts,
// so it is caught here (imported from main.tsx).
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    hideGuideForGood();
    listeners.forEach((l) => l());
  });
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export function onInstallPromptChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Shows the system install dialog; true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === 'accepted') hideGuideForGood();
  listeners.forEach((l) => l());
  return outcome === 'accepted';
}
