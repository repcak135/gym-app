// Applies a reviewed list of duplicate exercises (scripts/merge-review-2.json, owner-approved 2026-11-28).
// Re-runnable: ids already merged are skipped.
//
// For every removed id: its names (English and Polish) become search/import aliases of the kept exercise,
// its tips move over when the kept one has none, its time/distance measure moves over, and the id goes into
// src/data/exercise-merged.json (removed id → kept id). The app re-points user data on the catalogue
// upgrade, after restoring an old backup, and when matching old share links or import aliases.
// Renames give a new Polish name to different exercises that shared one.
//
// Usage: node scripts/merge-exercises.ts && bump EXERCISE_DB_VERSION in src/data/exercises.ts
import { readFileSync, writeFileSync } from 'node:fs';

type Named = { id: string; name: string; namePl?: string };
type OgFile = { added: Named[]; polishNames: Record<string, string>; aliases: Record<string, string[]>; merged?: Record<string, string> };

const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const OG = 'src/data/exercises-og.json';
const MERGED = 'src/data/exercise-merged.json';
const TIPS = 'src/data/tips-pl.json';
const INSTR = 'src/data/instructions-pl.json';
const MEASURE = 'src/data/exercise-measure.json';

const og = read<OgFile>(OG);
const review = read<{ merge: Record<string, string[]>; rename: Record<string, string> }>('scripts/merge-review-2.json');
let merged: Record<string, string>;
try {
  merged = read<Record<string, string>>(MERGED);
} catch {
  merged = og.merged ?? {};
}
delete og.merged;
const tips = read<Record<string, string[]>>(TIPS);
const instr = read<Record<string, string[]>>(INSTR);
const measure = read<Record<string, string[]>>(MEASURE);

const base = read<Named[]>('src/data/exercise-db.json');
const extra = read<Named[]>('src/data/exercises-extra.json');
const names = new Map<string, { en: string; pl?: string }>();
for (const e of [...base, ...extra]) names.set(e.id, { en: e.name, pl: og.polishNames[e.id] });
for (const e of og.added) names.set(e.id, { en: e.name, pl: e.namePl ?? og.polishNames[e.id] });

let removedCount = 0;
for (const [keep, removed] of Object.entries(review.merge)) {
  const k = names.get(keep);
  if (!k) throw new Error(`kept id not found: ${keep}`);
  if (merged[keep]) throw new Error(`kept id is itself merged: ${keep}`);
  for (const id of removed) {
    if (merged[id]) continue; // already applied
    const r = names.get(id);
    if (!r) throw new Error(`removed id not found: ${id}`);
    removedCount++;
    merged[id] = keep;
    const own = new Set([k.en, k.pl, review.rename[keep]].filter(Boolean));
    const add = [r.en, r.pl, ...(og.aliases[id] ?? [])].filter((n): n is string => !!n && !own.has(n));
    og.aliases[keep] = [...new Set([...(og.aliases[keep] ?? []), ...add])];
    delete og.aliases[id];
    if (tips[id] && !tips[keep]) tips[keep] = tips[id];
    delete tips[id];
    if (!base.some((e) => e.id === id)) delete instr[id]; // free-exercise-db rows stay in the raw file
    const list = Object.keys(measure).find((m) => measure[m].includes(id));
    if (list) {
      measure[list] = measure[list].filter((x) => x !== id);
      if (!Object.values(measure).some((l) => l.includes(keep))) measure[list].push(keep);
    }
  }
}
// Older merges pointing at an id removed now go straight to the final keeper.
for (const from of Object.keys(merged)) {
  let to = merged[from];
  while (merged[to] && merged[to] !== to) to = merged[to];
  merged[from] = to;
}
og.added = og.added.filter((e) => !merged[e.id]);

for (const [id, pl] of Object.entries(review.rename)) {
  const added = og.added.find((e) => e.id === id);
  if (added) added.namePl = pl;
  else if (names.has(id)) og.polishNames[id] = pl;
  else throw new Error(`rename id not found: ${id}`);
}

writeFileSync(OG, JSON.stringify(og));
writeFileSync(MERGED, JSON.stringify(Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))), null, 1) + '\n');
writeFileSync(TIPS, JSON.stringify(tips, null, 2) + '\n');
writeFileSync(INSTR, JSON.stringify(instr));
writeFileSync(MEASURE, JSON.stringify(measure) + '\n');
console.log(`merged ${removedCount} more, ${Object.keys(merged).length} merged in total, ${Object.keys(review.rename).length} renamed, ${og.added.length} openGym entries left`);
