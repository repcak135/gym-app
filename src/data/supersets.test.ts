import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import {
  groupsOf,
  groupLabel,
  nextInRound,
  linkItems,
  unlinkItems,
  moveGrouped,
  removeGrouped,
} from './supersets';
import { createPlan, addDay, addItems, linkWithNext, unlinkItem, moveItem, removeItem } from './plans';
import {
  startWorkout,
  getWorkoutSets,
  completeSet,
  linkExercises,
  unlinkExercise,
  moveExercise,
  removeExercise,
  swapExercise,
} from './workouts';

const it_ = (group?: string) => ({ group });

describe('groupsOf / groupLabel', () => {
  it('returns only runs of 2+ equal consecutive ids', () => {
    const items = [it_('a'), it_('a'), it_(), it_('b'), it_('c'), it_('c'), it_('c'), it_('a')];
    expect(groupsOf(items)).toEqual([
      { start: 0, end: 1 },
      { start: 4, end: 6 },
    ]);
    expect(groupsOf([])).toEqual([]);
  });
  it('labels', () => {
    expect(groupLabel(2)).toBe('Superseria');
    expect(groupLabel(3)).toBe('Obwód');
  });
});

describe('nextInRound', () => {
  const ab = [it_('g'), it_('g')];
  it('ungrouped: no next, end of round', () => {
    expect(nextInRound([it_(), it_()], [2, 2], 0)).toEqual({ next: null, endOfRound: true });
  });
  it('A done -> B without rest; B done -> A, end of round', () => {
    expect(nextInRound(ab, [2, 3], 0)).toEqual({ next: 1, endOfRound: false });
    expect(nextInRound(ab, [2, 2], 1)).toEqual({ next: 0, endOfRound: true });
  });
  it('uneven sets: B out of sets -> A rests after each set', () => {
    expect(nextInRound(ab, [1, 0], 0)).toEqual({ next: null, endOfRound: true });
    expect(nextInRound(ab, [0, 1], 0)).toEqual({ next: 1, endOfRound: false });
    expect(nextInRound(ab, [0, 0], 1)).toEqual({ next: null, endOfRound: true });
  });
  it('circuit of 3, middle item', () => {
    const c = [it_('g'), it_('g'), it_('g')];
    expect(nextInRound(c, [1, 1, 1], 1)).toEqual({ next: 2, endOfRound: false });
    expect(nextInRound(c, [1, 0, 0], 1)).toEqual({ next: 0, endOfRound: true });
    expect(nextInRound(c, [0, 0, 1], 1)).toEqual({ next: 2, endOfRound: false });
  });
});

describe('pure group editing', () => {
  it('link joins, reuses ids, refuses over 3 and the last item', () => {
    const base = [it_(), it_(), it_(), it_()];
    const l1 = linkItems(base, 0)!;
    expect(l1[0].group).toBeTruthy();
    expect(l1[0].group).toBe(l1[1].group);
    const l2 = linkItems(l1, 1)!;
    expect(new Set([l2[0].group, l2[1].group, l2[2].group]).size).toBe(1);
    expect(linkItems(l2, 2)).toBeNull(); // would be 4
    expect(linkItems(base, 3)).toBeNull(); // last
    expect(linkItems(l1, 0)).toBeNull(); // already together
  });
  it('unlink dissolves a group left with one item', () => {
    const l = linkItems([it_(), it_(), it_()], 0)!;
    const u = unlinkItems(l, 0);
    expect(u.every((x) => !x.group)).toBe(true);
    const l3 = linkItems(linkItems([it_(), it_(), it_()], 0)!, 1)!;
    const u3 = unlinkItems(l3, 2);
    expect(u3[0].group).toBeTruthy();
    expect(u3[0].group).toBe(u3[1].group);
    expect(u3[2].group).toBeUndefined();
  });
  it('move out of the block / remove leaves the group', () => {
    const l3 = linkItems(linkItems([it_(), it_(), it_(), it_()], 0)!, 1)!;
    const moved = moveGrouped(l3, 0, 3);
    expect(moved.map((x) => !!x.group)).toEqual([true, true, false, false]);
    const rem = removeGrouped(linkItems([it_(), it_(), it_()], 0)!, 0);
    expect(rem.every((x) => !x.group)).toBe(true);
  });
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function planWith(ids: string[]) {
  const plan = await createPlan('P');
  const day = await addDay(plan.id, 'D');
  await addItems(plan.id, day.id, ids);
  return { plan, day };
}
const items = async (planId: string, dayId: string) =>
  (await db.plans.get(planId))!.days.find((d) => d.id === dayId)!.items;

describe('plans: link / unlink', () => {
  it('links, limits to 3, unlinks, move/remove drop out', async () => {
    const { plan, day } = await planWith(['a', 'b', 'c', 'd']);
    expect(await linkWithNext(plan.id, day.id, 0)).toBe(true);
    expect(await linkWithNext(plan.id, day.id, 1)).toBe(true);
    expect(await linkWithNext(plan.id, day.id, 2)).toBe(false);
    let it = await items(plan.id, day.id);
    expect(groupsOf(it)).toEqual([{ start: 0, end: 2 }]);
    await unlinkItem(plan.id, day.id, 1);
    it = await items(plan.id, day.id);
    expect(groupsOf(it)).toEqual([]);
    await linkWithNext(plan.id, day.id, 0);
    await moveItem(plan.id, day.id, 0, 3);
    it = await items(plan.id, day.id);
    expect(it.map((x) => x.exerciseId)).toEqual(['b', 'c', 'd', 'a']);
    expect(groupsOf(it)).toEqual([]);
    await linkWithNext(plan.id, day.id, 0);
    await removeItem(plan.id, day.id, 0);
    expect(groupsOf(await items(plan.id, day.id))).toEqual([]);
  });
});

describe('workouts: groups', () => {
  it('startWorkout copies group; link/unlink/move/remove/swap behave', async () => {
    const { plan, day } = await planWith(['a', 'b', 'c']);
    await linkWithNext(plan.id, day.id, 0);
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    let ex = (await db.workouts.get(w.id))!.exercises!;
    expect(groupsOf(ex)).toEqual([{ start: 0, end: 1 }]);
    await db.exercises.bulkPut([{ id: 'z', name: 'Z' } as never]);
    await swapExercise(w.id, 1, 'z');
    ex = (await db.workouts.get(w.id))!.exercises!;
    expect(groupsOf(ex)).toEqual([{ start: 0, end: 1 }]);
    expect(await linkExercises(w.id, 1)).toBe(true);
    ex = (await db.workouts.get(w.id))!.exercises!;
    expect(groupsOf(ex)).toEqual([{ start: 0, end: 2 }]);
    await unlinkExercise(w.id, 2);
    await moveExercise(w.id, 0, 2);
    ex = (await db.workouts.get(w.id))!.exercises!;
    expect(groupsOf(ex)).toEqual([]);
    expect(await linkExercises(w.id, 0)).toBe(true);
    await removeExercise(w.id, 0);
    ex = (await db.workouts.get(w.id))!.exercises!;
    expect(groupsOf(ex)).toEqual([]);
  });

  it('completeSet: no rest inside a round, rest at round end and for the survivor', async () => {
    const { plan, day } = await planWith(['a', 'b']);
    await linkWithNext(plan.id, day.id, 0);
    const w = await startWorkout({ planId: plan.id, dayId: day.id });
    const sets = await getWorkoutSets(w.id);
    const a = sets.filter((s) => s.exerciseId === 'a');
    const b = sets.filter((s) => s.exerciseId === 'b');
    await completeSet(a[0].id);
    expect((await db.workouts.get(w.id))!.restEndsAt).toBeUndefined();
    await completeSet(b[0].id);
    expect((await db.workouts.get(w.id))!.restEndsAt).toBeGreaterThan(Date.now());
    // finish B entirely; A keeps resting after each set
    await db.workouts.update(w.id, { restEndsAt: undefined });
    for (const s of b.slice(1)) await completeSet(s.id);
    await db.workouts.update(w.id, { restEndsAt: undefined });
    await completeSet(a[1].id);
    expect((await db.workouts.get(w.id))!.restEndsAt).toBeGreaterThan(0);
  });
});
