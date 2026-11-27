import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { api, ApiError } from './api';
import { lastSent, markSent, signOutLocally } from './account';
import { computeScores, monthKey } from './scores';

/** Earliest start of the current ISO week or month: only those workouts are read. */
function periodStart(now: number): number {
  const d = new Date(now);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
  const first = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return Math.min(monday, first);
}

/** The scores this phone should have on the server right now, or null when not in the ranking. */
export async function currentScores(now = Date.now()) {
  const s = await db.settings.get('app');
  if (!s?.rankToken) return null;
  const workouts = await db.workouts.where('startedAt').aboveOrEqual(periodStart(now)).toArray();
  const ids = workouts.map((w) => w.id);
  const sets = ids.length ? await db.sets.where('workoutId').anyOf(ids).toArray() : [];
  const body = await db.body.toArray();
  const payload = computeScores({ workouts, sets, body }, now, { workouts: !!s.rankShareWorkouts, bench: !!s.rankShareBench }, s.rankSex);
  return { token: s.rankToken, nick: s.rankNick ?? '', payload };
}

/** Sends the scores when they differ from the last successful send. Failures retry on the next change or app start. */
export async function syncScores(now = Date.now()): Promise<'sent' | 'same' | 'off' | 'failed'> {
  const cur = await currentScores(now);
  if (!cur) return 'off';
  const json = JSON.stringify({ nick: cur.nick, ...cur.payload });
  if (json === lastSent()) return 'same';
  try {
    await api.scores(cur.token, cur.payload);
    markSent(json);
    return 'sent';
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) await signOutLocally(); // the session ended elsewhere
    return 'failed';
  }
}

/**
 * Mounted once in App. Watches workouts, sets, Ciało and the ranking settings, so finishing, editing
 * or deleting a workout, restoring a backup or a new body weight all resync (a short delay batches
 * quick edits). The month key is part of the watch so a new week or month also resyncs on start.
 */
export default function RankingSync() {
  const tick = useLiveQuery(async () => {
    const cur = await currentScores();
    return cur ? JSON.stringify(cur.payload) + monthKey(Date.now()) : null;
  }, []);
  useEffect(() => {
    if (!tick) return;
    const t = setTimeout(() => void syncScores(), 1500);
    return () => clearTimeout(t);
  }, [tick]);
  return null;
}
