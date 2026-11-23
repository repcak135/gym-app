// Builds src/data/exercises-og.json from a local checkout of openGym's exercise catalogue TEXT
// (https://github.com/DuarteSantos8/openGym, catalogue/exercises + catalogue/i18n/pl.json, AGPL-3.0).
// openGym's media (catalogue/media, Gym visual) is not licensed for us and is never read or used.
//
// Usage: node scripts/build-opengym.ts <path-to-openGym-checkout>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeName } from '../src/data/csvImport.ts';

type Og = {
  id: string; name?: string; bodyPart: string; equipment: string; target: string;
  secondaryMuscles: string[]; category: string; instructions: string[]; variantOf?: string;
};
type Raw = { id: string; name: string; equipment: string | null; primaryMuscles: string[]; secondaryMuscles: string[] };

const root = process.argv[2];
if (!root) throw new Error('Podaj ścieżkę do repo openGym');
const dir = join(root, 'catalogue', 'exercises');
const pl: Record<string, { name?: string; instructions?: string[] }> = JSON.parse(
  readFileSync(join(root, 'catalogue', 'i18n', 'pl.json'), 'utf8'),
);

// Gym-focused: no yoga, pilates, rehab, combat, stretching or mobility (free-exercise-db has stretches).
const CATEGORY: Record<string, string> = {
  strength: 'strength', calisthenics: 'strength', isometric: 'strength', plyometrics: 'plyometrics',
  olympic: 'olympic weightlifting', cardio: 'cardio',
};
const EQUIPMENT: Record<string, string | null> = {
  'body weight': 'body only', dumbbell: 'dumbbell', cable: 'cable', barbell: 'barbell', 'olympic barbell': 'barbell',
  landmine: 'barbell', 'leverage machine': 'machine', 'smith machine': 'machine', 'sled machine': 'machine',
  assisted: 'machine', 'stationary bike': 'machine', 'elliptical machine': 'machine', 'upper body ergometer': 'machine',
  'skierg machine': 'machine', 'stepmill machine': 'machine', band: 'bands', 'resistance band': 'bands',
  kettlebell: 'kettlebells', 'stability ball': 'exercise ball', 'medicine ball': 'medicine ball',
  'ez barbell': 'e-z curl bar', weighted: 'other', 'suspension trainer': 'other', 'weight plate': 'other',
  rope: 'other', 'bosu ball': 'other', sandbag: 'other', 'trap bar': 'other', macebell: 'other', tire: 'other',
  hammer: 'other', 'wheel roller': 'other',
};
const SKIP_EQUIPMENT = new Set(['roller', 'massage ball']);

// openGym muscle words → free-exercise-db vocabulary (stats and body map use it). null = no equivalent.
const MUSCLE: Record<string, string | null> = {
  glutes: 'glutes', abs: 'abdominals', abdominals: 'abdominals', core: 'abdominals', obliques: 'abdominals',
  'lower abs': 'abdominals', quads: 'quadriceps', quadriceps: 'quadriceps', pectorals: 'chest', chest: 'chest',
  'upper chest': 'chest', 'serratus anterior': 'chest', 'front delts': 'shoulders', 'side delts': 'shoulders',
  'rear delts': 'shoulders', 'rotator cuff': 'shoulders', 'upper back': 'middle back', rhomboids: 'middle back',
  back: 'middle back', biceps: 'biceps', brachialis: 'biceps', triceps: 'triceps', lats: 'lats',
  'latissimus dorsi': 'lats', hamstrings: 'hamstrings', calves: 'calves', soleus: 'calves', spine: 'lower back',
  'lower back': 'lower back', forearms: 'forearms', 'grip muscles': 'forearms', 'wrist flexors': 'forearms',
  'wrist extensors': 'forearms', wrists: 'forearms', abductors: 'abductors', adductors: 'adductors',
  'inner thighs': 'adductors', groin: 'adductors', traps: 'traps', trapezius: 'traps', 'levator scapulae': 'neck',
  sternocleidomastoid: 'neck', 'cardiovascular system': null, 'hip flexors': null, shins: null, ankles: null,
  feet: null, hands: null, 'ankle stabilizers': null,
};
const BODY_PART: Record<string, string | null> = {
  'upper legs': 'quadriceps', waist: 'abdominals', back: 'middle back', shoulders: 'shoulders',
  'upper arms': 'biceps', chest: 'chest', 'lower legs': 'calves', 'lower arms': 'forearms', neck: 'neck',
  'full body': null, cardio: null,
};

const SMALL = new Set(['with', 'on', 'to', 'of', 'and', 'the', 'a', 'in', 'at', 'or', 'over', 'from']);
const titleCase = (s: string) =>
  s
    .split(' ')
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/^(\(?)(\p{L})/u, (_, p: string, c: string) => p + c.toUpperCase())))
    .join(' ');
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Same movement = same name tokens ("lever" = machine) and the same kind of equipment.
const dedupeKey = (name: string, equipment: string | null) =>
  `${[...new Set(normalizeName(name.replace(/\blever\b/gi, 'machine').replace(/\bsmith\b(?! machine)/gi, 'smith machine')))].sort().join(' ')}|${equipment ?? ''}`;

const existing: Raw[] = [
  ...JSON.parse(readFileSync('src/data/exercise-db.json', 'utf8')),
  ...JSON.parse(readFileSync('src/data/exercises-extra.json', 'utf8')),
];
const aka: Record<string, { aka?: string[] }> = JSON.parse(readFileSync('src/data/exercise-aka.json', 'utf8'));
const known = new Map<string, Raw>();
// The same name means the same exercise even when the equipment is recorded differently.
const knownName = new Map(existing.map((e) => [e.name.toLowerCase(), e]));
for (const e of existing) {
  for (const n of [e.name, ...(aka[e.name]?.aka ?? [])]) {
    const k = dedupeKey(n, e.equipment);
    if (!known.has(k)) known.set(k, e);
  }
}

const added: unknown[] = [];
const polishNames: Record<string, string> = {}; // existing exercise id → Polish name (search + subtitle)
const seen = new Set<string>();
let skipped = 0;
for (const f of readdirSync(dir).sort()) {
  const og: Og = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const category = CATEGORY[og.category];
  if (!og.name || og.variantOf || !category || SKIP_EQUIPMENT.has(og.equipment)) { skipped++; continue; }
  const equipment = og.equipment in EQUIPMENT ? EQUIPMENT[og.equipment] : 'other';
  const name = titleCase(og.name);
  const namePl = pl[og.id]?.name ? capitalize(pl[og.id].name!) : undefined;
  const key = dedupeKey(og.name, equipment);
  const same = known.get(key) ?? knownName.get(name.toLowerCase());
  if (same) {
    if (namePl && !polishNames[same.id]) polishNames[same.id] = namePl;
    continue;
  }
  if (seen.has(key)) continue; // openGym's own near-duplicates (e.g. "v. 2" naming aside)
  seen.add(key);

  const primary = MUSCLE[og.target] ?? BODY_PART[og.bodyPart] ?? null;
  const primaryMuscles = primary ? [primary] : [];
  const secondaryMuscles = [...new Set(og.secondaryMuscles.map((m) => MUSCLE[m] ?? null))].filter(
    (m): m is string => !!m && !primaryMuscles.includes(m),
  );
  const plSteps = pl[og.id]?.instructions;
  added.push({
    id: `og-${og.id}`,
    name,
    ...(namePl ? { namePl } : {}),
    equipment,
    category,
    primaryMuscles,
    secondaryMuscles,
    // Polish steps where openGym has them, English otherwise.
    instructions: plSteps?.length ? plSteps : og.instructions,
    images: [],
  });
}

writeFileSync('src/data/exercises-og.json', JSON.stringify({ added, polishNames }));
console.log(`added ${added.length}, Polish names for ${Object.keys(polishNames).length} existing, skipped ${skipped}`);
