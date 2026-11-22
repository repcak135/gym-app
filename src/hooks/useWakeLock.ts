import { useEffect } from 'react';

type Sentinel = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } };

/** Keeps the screen on while mounted. The browser drops the lock when the app is hidden, so it is re-requested on return. */
export function useWakeLock(): void {
  useEffect(() => {
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;
    let lock: Sentinel | undefined;
    let alive = true;
    const request = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const l = await nav.wakeLock!.request('screen');
        if (alive) lock = l;
        else void l.release().catch(() => {});
      } catch {
        // Not allowed (battery saver, unsupported): the workout works without it.
      }
    };
    void request();
    const onVisible = () => void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);
}
