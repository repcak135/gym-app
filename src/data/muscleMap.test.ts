import { describe, expect, it } from 'vitest';
import base from './exercise-db.json';
import extra from './exercises-extra.json';
import og from './exercises-og.json';
import { MUSCLES } from './exerciseLabels';
import { MUSCLE_GROUPS, bodyParts, muscleGroup, MUSCLE_TO_GROUP } from './muscleMap';

type WithMuscles = { primaryMuscles?: string[]; secondaryMuscles?: string[] };

function words(list: WithMuscles[]): string[] {
  return list.flatMap((e) => [...(e.primaryMuscles ?? []), ...(e.secondaryMuscles ?? [])]);
}

describe('muscle map', () => {
  const all = new Set<string>([
    ...words(base as WithMuscles[]),
    ...words(extra as WithMuscles[]),
    ...words((og as unknown as { added: WithMuscles[] }).added),
    ...MUSCLES,
  ]);

  it('maps every muscle word of every exercise source to a group and a silhouette part', () => {
    expect(all.size).toBeGreaterThan(10);
    const noGroup = [...all].filter((w) => !muscleGroup(w));
    const noBody = [...all].filter((w) => bodyParts(w).length === 0);
    expect(noGroup, 'muscle words without a chart group').toEqual([]);
    expect(noBody, 'muscle words without a silhouette part').toEqual([]);
  });

  it('has the ten chart groups in order and every group is reachable', () => {
    expect(MUSCLE_GROUPS.map((g) => g.label)).toEqual([
      'Klatka', 'Plecy', 'Barki', 'Nogi', 'Biceps', 'Triceps', 'Brzuch', 'Łydki', 'Pośladki', 'Przedramiona',
    ]);
    const reached = new Set(Object.values(MUSCLE_TO_GROUP));
    for (const g of MUSCLE_GROUPS) expect(reached.has(g.key), g.key).toBe(true);
  });
});
