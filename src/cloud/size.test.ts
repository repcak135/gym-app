import { describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { createBackup } from '../data/backup';
import { encryptBackup, newBackupKey } from './crypto';
const MAX_UPLOAD = 10 * 1024 * 1024; // server/src/cloud.ts

// Spec: measure an owner-size history after compression and keep it far below the 10 MB upload cap.
describe('backup size', () => {
  it('3 years × 4 workouts a week × 25 sets stays far below the cap', async () => {
    await Promise.all([db.workouts.clear(), db.sets.clear()]);
    const workouts = [];
    const sets = [];
    let n = 0;
    for (let w = 0; w < 3 * 52 * 4; w++) {
      const id = `w${w}`;
      workouts.push({ id, name: `Trening ${w % 4}`, startedAt: w * 86_400_000, endedAt: w * 86_400_000 + 3_600_000, source: 'import' as const, importKey: `k${w}` });
      for (let s = 0; s < 25; s++)
        sets.push({ id: `s${n++}`, workoutId: id, exerciseId: `Ex_${s % 8}`, exerciseOrder: s % 8, setOrder: s, weight: 40 + (s % 9) * 5, reps: 8 + (s % 5), warmup: s % 7 === 0, completedAt: w * 86_400_000 + s * 60_000 });
    }
    await db.workouts.bulkAdd(workouts);
    await db.sets.bulkAdd(sets as never);
    const json = JSON.stringify(await createBackup());
    const blob = await encryptBackup(json, newBackupKey());
    console.log(`backup: ${(json.length / 1024 / 1024).toFixed(2)} MB JSON → ${(blob.length / 1024 / 1024).toFixed(2)} MB encrypted (${sets.length} sets)`);
    expect(blob.length).toBeLessThan(MAX_UPLOAD / 4);
  }, 60_000);
});
