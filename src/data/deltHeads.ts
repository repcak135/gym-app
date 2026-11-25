import type { Exercise } from './types';
import overridesData from './delt-overrides.json' with { type: 'json' };

export type DeltHead = 'front' | 'side' | 'rear';
export interface Delts {
  primary: DeltHead[];
  secondary: DeltHead[];
}

export const DELT_LABEL: Record<DeltHead, string> = { front: 'przód', side: 'bok', rear: 'tył' };

export function deltChipLabel(h: DeltHead): string {
  return `Barki — ${DELT_LABEL[h]}`;
}

/** Heads of an exercise in the given role; none when the exercise has no `delts`. */
export function deltHeadsOf(ex: Pick<Exercise, 'delts'>, role: 'primary' | 'secondary' | 'any' = 'any'): DeltHead[] {
  const d = ex.delts;
  if (!d) return [];
  if (role === 'primary') return d.primary;
  if (role === 'secondary') return d.secondary;
  return [...new Set([...d.primary, ...d.secondary])];
}

/** Manual fixes by exercise id; `null` = leave unclassified. */
const OVERRIDES = overridesData as Record<string, Delts | null>;

const REAR =
  /rear delt|revers\w* (\w+ )?fl|reverse (delt|pec ?deck)|rear (delt )?fl|pull[- ]?apart|powell raise|\bt[- ]raise|\bw[- ]raise|y elevation|face ?pull|rear[- ]delt|bent[- ]over (lateral|dumbbell )?raise|rear lateral|prone y|y[- ]raise|band pull[- ]apart|seated bent-over/;
const SIDE = /lateral raise|side raise|side lateral|lateral delt|cable lateral|lean[- ]away lateral|lateral(s)? to front|lu raise|side[- ]lying (\w+ )*raise|upright (\w+ )?row|\bl[- ]raise/;
const FRONT = /forward raise|front (\w+[- ])*raise|front plate raise|front delt|deltoid raise/;
const PRESS =
  /overhead press|shoulders? press|military press|arnold|push press|seated (dumbbell|barbell) press|landmine press|handstand push|pike push|jerk|thruster|clean and press|bradford|rocky|see-?saw press|para press|linear jammer/;
/** Shoulders as a primary muscle and "press" in the name: an overhead press (bench / incline / chest presses are caught earlier). */
const ANY_PRESS = /press/;
const HORIZONTAL = /bench press|incline|push-?up|dip|chest press|fly(e)?s?\b/;
const PULL = /row|pull/;

const own = (d: Delts): Delts => ({ primary: [...d.primary], secondary: [...d.secondary] });

/** Rule-based deltoid heads for a built-in exercise; undefined = unknown (plain "Barki"). */
export function classifyDelts(
  ex: Pick<Exercise, 'id' | 'name' | 'equipment' | 'primaryMuscles' | 'secondaryMuscles'>,
): Delts | undefined {
  if (Object.hasOwn(OVERRIDES, ex.id)) {
    const o = OVERRIDES[ex.id];
    return o ? own(o) : undefined;
  }
  const name = ex.name.toLowerCase();
  const inPrimary = ex.primaryMuscles.includes('shoulders');
  const inSecondary = ex.secondaryMuscles.includes('shoulders');
  const listed = inPrimary || inSecondary;
  // Heads go to `primary` only when shoulders is a primary muscle; otherwise to `secondary`.
  const make = (primary: DeltHead[], secondary: DeltHead[], forceSecondary = false): Delts =>
    inPrimary && !forceSecondary
      ? { primary, secondary }
      : { primary: [], secondary: [...new Set([...primary, ...secondary])] };

  if (REAR.test(name)) {
    // A rear-delt pattern counts even when "shoulders" is not listed.
    return listed ? make(['rear'], []) : { primary: ['rear'], secondary: [] };
  }
  if (!listed) return undefined;
  if (SIDE.test(name)) return make(['side'], /upright (\w+ )?row/.test(name) ? ['front'] : []);
  if (FRONT.test(name)) return make(['front'], []);
  if (PRESS.test(name) || (inPrimary && ANY_PRESS.test(name) && !HORIZONTAL.test(name))) {
    return make(/arnold/.test(name) ? ['front', 'side'] : ['front'], /arnold/.test(name) ? [] : ['side']);
  }
  if (HORIZONTAL.test(name)) return make([], ['front'], true);
  if (PULL.test(name)) return make([], ['rear'], true);
  return undefined;
}
