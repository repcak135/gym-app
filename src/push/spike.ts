import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getActiveWorkout } from '../data/workouts';
import { PUSH_URL, pushConfigured } from './config';

// TEMPORARY spike (2026-11-27): does a locking iPhone still deliver a keepalive request?
// Turned on by tapping "Wersja" in Ustawienia 5 times. Sends only times, no workout data.
const FLAG = 'gym.pushSpike';

export function spikeOn(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

export function toggleSpike(): boolean {
  const on = !spikeOn();
  try {
    if (on) localStorage.setItem(FLAG, '1');
    else localStorage.removeItem(FLAG);
  } catch {
    // private mode
  }
  return on;
}

function nextSeq(): number {
  let n = 0;
  try {
    n = Number(localStorage.getItem('gym.pushSpikeSeq') ?? '0') + 1;
    localStorage.setItem('gym.pushSpikeSeq', String(n));
  } catch {
    // private mode
  }
  return n;
}

function post(path: string, body: object) {
  try {
    void fetch(PUSH_URL + path, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  } catch {
    // ignore
  }
}

export function PushSpike() {
  const endsAt = useLiveQuery(async () => (await getActiveWorkout())?.restEndsAt ?? null, []);
  const ref = useRef<number | null>(null);
  ref.current = endsAt ?? null;
  useEffect(() => {
    if (!pushConfigured()) return;
    let sentAt = 0;
    const hide = (kind: string) => {
      if (!spikeOn()) return;
      const e = ref.current;
      if (e === null || e <= Date.now()) return;
      if (Date.now() - sentAt < 1500) return;
      sentAt = Date.now();
      post('/schedule', { seq: nextSeq(), at: Date.now(), endsAt: e, kind });
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') hide('hidden');
      else if (spikeOn()) post('/cancel', { at: Date.now(), kind: 'visible' });
    };
    const onPageHide = () => hide('pagehide');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);
  return null;
}
