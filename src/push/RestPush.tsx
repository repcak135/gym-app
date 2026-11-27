import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { getActiveWorkout } from '../data/workouts';
import { cancelRestPush, scheduleRestPush } from './client';
import { REST_PUSH_TITLE, restPushBody } from './restText';

type Armed = { id: string; endsAt: number; body: string } | null;

/**
 * Mounted once in App. While "Powiadomienie przy zablokowanym ekranie" is on and a rest runs,
 * hiding the app (or locking the phone) asks the server for a "Koniec przerwy" push at the rest
 * end; coming back cancels it, because the in-app timer and banner take over.
 * Everything is read ahead of time so the request leaves synchronously in the hide event.
 */
export default function RestPush() {
  const armed = useLiveQuery(async (): Promise<Armed> => {
    const settings = await db.settings.get('app');
    if (!settings?.restPush || !settings.pushId) return null;
    const w = await getActiveWorkout();
    if (!w?.restEndsAt) return null;
    const sets = await db.sets.where('workoutId').equals(w.id).toArray();
    const ids = [...new Set(sets.map((s) => s.exerciseId))];
    const names = new Map((await db.exercises.bulkGet(ids)).map((e, i) => [ids[i], e?.name]));
    return { id: settings.pushId, endsAt: w.restEndsAt, body: restPushBody(w, sets, (id) => names.get(id)) };
  }, []);
  const ref = useRef<Armed>(null);
  ref.current = armed ?? null;

  useEffect(() => {
    let sentFor: string | null = null; // device id of a push the server may still hold
    let lastHide = 0;
    const hide = () => {
      const a = ref.current;
      const now = Date.now();
      // visibilitychange and pagehide often fire together: send once.
      if (!a || a.endsAt <= now || now - lastHide < 1500) return;
      lastHide = now;
      sentFor = a.id;
      scheduleRestPush(a.id, a.endsAt, REST_PUSH_TITLE, a.body);
    };
    const show = () => {
      if (sentFor === null) return;
      cancelRestPush(sentFor);
      sentFor = null;
      lastHide = 0;
    };
    const onVisibility = () => (document.visibilityState === 'hidden' ? hide() : show());
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', hide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', hide);
    };
  }, []);
  return null;
}
