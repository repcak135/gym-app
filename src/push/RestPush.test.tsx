import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { db } from '../data/db';
import { updateSettings } from '../data/settings';
import type { Workout } from '../data/types';

const schedule = vi.fn();
const cancel = vi.fn();
vi.mock('./client', () => ({
  scheduleRestPush: (...a: unknown[]) => schedule(...a),
  cancelRestPush: (...a: unknown[]) => cancel(...a),
}));
const { default: RestPush } = await import('./RestPush');

const ID = 'd'.repeat(32);
let visibility: DocumentVisibilityState = 'visible';

function setVisibility(v: DocumentVisibilityState) {
  visibility = v;
  document.dispatchEvent(new Event('visibilitychange'));
}

async function seed(opts: { restEndsAt?: number; push?: boolean }) {
  const w: Workout = {
    id: 'w1', name: 'A', startedAt: 1, source: 'app', currentIndex: 0, restEndsAt: opts.restEndsAt,
    exercises: [{ exerciseId: 'Squat', warmupSets: 0, sets: 2, repsMin: 5, repsMax: 8, restSec: 90 }],
  };
  await db.workouts.put(w);
  await db.exercises.put({ id: 'Squat', name: 'Przysiad' } as never);
  await db.sets.bulkPut([
    { id: 's1', workoutId: 'w1', exerciseId: 'Squat', exerciseOrder: 0, setOrder: 0, weight: 100, reps: 5, warmup: false, completedAt: 2 },
    { id: 's2', workoutId: 'w1', exerciseId: 'Squat', exerciseOrder: 0, setOrder: 1, weight: 100, reps: 5, warmup: false },
  ] as never);
  if (opts.push !== false) await updateSettings({ restPush: true, pushId: ID });
}

/** Lets the live query settle. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

beforeEach(async () => {
  await Promise.all([db.workouts.clear(), db.sets.clear(), db.settings.clear()]);
  schedule.mockReset();
  cancel.mockReset();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { get: () => visibility, configurable: true });
});
afterEach(() => vi.useRealTimers());

describe('RestPush', () => {
  it('hiding during a rest schedules the push once (visibilitychange + pagehide)', async () => {
    const endsAt = Date.now() + 90_000;
    await seed({ restEndsAt: endsAt });
    render(<RestPush />);
    await settle();
    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(ID, endsAt, 'Koniec przerwy', 'Seria 2 · Przysiad');
  });

  it('coming back cancels the push', async () => {
    await seed({ restEndsAt: Date.now() + 90_000 });
    render(<RestPush />);
    await settle();
    setVisibility('hidden');
    setVisibility('visible');
    expect(cancel).toHaveBeenCalledWith(ID);
  });

  it('no rest running: nothing is sent, also not on return', async () => {
    await seed({});
    render(<RestPush />);
    await settle();
    setVisibility('hidden');
    setVisibility('visible');
    expect(schedule).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('switch off: nothing is sent', async () => {
    await seed({ restEndsAt: Date.now() + 90_000, push: false });
    render(<RestPush />);
    await settle();
    setVisibility('hidden');
    expect(schedule).not.toHaveBeenCalled();
  });

  it('a rest that already ended is not scheduled', async () => {
    await seed({ restEndsAt: Date.now() - 1000 });
    render(<RestPush />);
    await settle();
    setVisibility('hidden');
    expect(schedule).not.toHaveBeenCalled();
  });
});
