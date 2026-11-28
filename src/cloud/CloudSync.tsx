import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { getActiveWorkout } from '../data/workouts';
import { dataFingerprint, UPLOAD_GAP_MS, uploadNow } from './cloud';

/** When the next automatic upload may run: after the 10-minute gap since the last one. */
export function nextUploadDelay(lastAt: number | undefined, now: number): number {
  return lastAt === undefined ? 0 : Math.max(0, lastAt + UPLOAD_GAP_MS - now);
}

/**
 * Mounted once in App. With cloud backup on and no workout running, a change in the data (a finished,
 * edited or deleted workout, a new measurement) uploads a new encrypted backup, at most once per
 * 10 minutes. A failed upload keeps the old fingerprint, so the next app start tries again.
 */
export default function CloudSync() {
  const due = useLiveQuery(async () => {
    const s = await db.settings.get('app');
    if (!s?.cloudOn || !s.cloudKey || !s.rankToken) return null;
    if (await getActiveWorkout()) return null; // upload after the workout, not in the middle of it
    const fp = await dataFingerprint();
    return fp === s.cloudFingerprint ? null : { fp, lastAt: s.cloudLastAt };
  }, []);
  useEffect(() => {
    if (!due) return;
    const t = setTimeout(() => void uploadNow().catch(() => {}), nextUploadDelay(due.lastAt, Date.now()) + 2000);
    return () => clearTimeout(t);
  }, [due?.fp, due?.lastAt]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
