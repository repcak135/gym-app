// Merges duplicate exercises after scripts/build-opengym.ts. Re-runnable.
//
// 1. Exact duplicates (same normalized name, equipment and primary muscle) merge automatically.
// 2. Near duplicates (names differ only by words that repeat the equipment, "(left)", "full range of motion"…)
//    merge when scripts/dedupe-review.json lists the pair as "same"; undecided pairs are reported as pending.
// Keeper: free-exercise-db id (has photos; plans/notes/history use it) > our x- extras > openGym, then the plainest name.
// free-exercise-db ids are never removed (two free-exercise-db entries stay as they are); an x- or openGym entry is
// removed in favour of the keeper and its names become search/import aliases. User data is re-pointed on upgrade.
//
// Usage: node scripts/build-opengym.ts <openGym checkout> && node scripts/dedupe-exercises.ts
// (rewrites src/data/exercises-og.json, writes docs/exercise-duplicates.md)
import { readFileSync, writeFileSync } from 'node:fs';
import { dedupeKey, exactGroups, nearPairs, type DedupeEntry } from '../src/data/exerciseDedupe.ts';

type Ex = DedupeEntry & { namePl?: string; src: 'db' | 'x' | 'og' };
type OgFile = {
  added: (DedupeEntry & { namePl?: string })[];
  polishNames: Record<string, string>;
  aliases?: Record<string, string[]>;
  merged?: Record<string, string>;
};

const OG_PATH = 'src/data/exercises-og.json';
const og: OgFile = JSON.parse(readFileSync(OG_PATH, 'utf8'));
// Since catalogue 9 the merged map lives in src/data/exercise-merged.json and later merges come from
// scripts/merge-exercises.ts; this first pass only runs on a fresh scripts/build-opengym.ts output.
if (og.merged || og.aliases) {
  console.error('exercises-og.json is already deduplicated: run scripts/build-opengym.ts first, then this script, then scripts/merge-exercises.ts.');
  process.exit(1);
}
const review: { same: [string, string][]; different: [string, string][] } = JSON.parse(
  readFileSync('scripts/dedupe-review.json', 'utf8'),
);
const all: Ex[] = [
  ...JSON.parse(readFileSync('src/data/exercise-db.json', 'utf8')).map((e: Ex) => ({ ...e, namePl: og.polishNames[e.id], src: 'db' as const })),
  ...JSON.parse(readFileSync('src/data/exercises-extra.json', 'utf8')).map((e: Ex) => ({ ...e, namePl: og.polishNames[e.id], src: 'x' as const })),
  ...og.added.map((e) => ({ ...e, src: 'og' as const })),
];

const RANK = { db: 0, x: 1, og: 2 };
const plainness = (e: Ex) => (/\bv\.\s*\d|\((left|right)\)/i.test(e.name) ? 1 : 0);
const better = (a: Ex, b: Ex) =>
  RANK[a.src] - RANK[b.src] || plainness(a) - plainness(b) || a.name.length - b.name.length || a.id.localeCompare(b.id);

// Union-find over ids.
const parent = new Map<string, string>();
const find = (id: string): string => {
  const p = parent.get(id) ?? id;
  if (p === id) return id;
  const r = find(p);
  parent.set(id, r);
  return r;
};
const union = (a: string, b: string) => parent.set(find(a), find(b));

const exact = exactGroups(all);
for (const g of exact) for (const e of g.slice(1)) union(e.id, g[0].id);

const seen = new Set<string>();
const reps = all.filter((e) => (seen.has(dedupeKey(e)) ? false : (seen.add(dedupeKey(e)), true)));
const pairKey = (a: string, b: string) => [a, b].sort().join('\u0000');
const same = new Set(review.same.map(([a, b]) => pairKey(a, b)));
const different = new Set(review.different.map(([a, b]) => pairKey(a, b)));
const near = nearPairs(reps);
const pending: [Ex, Ex, string][] = [];
let nearMerged = 0;
for (const [a, b, why] of near) {
  const k = pairKey(a.name, b.name);
  if (same.has(k)) { union(a.id, b.id); nearMerged++; }
  else if (!different.has(k)) pending.push([a, b, why]);
}

// Build groups and pick keepers.
const groups = new Map<string, Ex[]>();
for (const e of all) groups.set(find(e.id), [...(groups.get(find(e.id)) ?? []), e]);
const aliases: Record<string, string[]> = { ...(og.aliases ?? {}) };
const merged: Record<string, string> = { ...(og.merged ?? {}) };
const removed = new Set<string>();
const examples: string[] = [];
let protectedPairs = 0;
for (const g of groups.values()) {
  if (g.length < 2) continue;
  const sorted = [...g].sort(better);
  const keeper = sorted[0];
  for (const e of sorted.slice(1)) {
    if (e.src === 'db') { protectedPairs++; continue; } // free-exercise-db ids stay (photos, Polish tips)
    removed.add(e.id);
    merged[e.id] = keeper.id;
    if (e.namePl && !keeper.namePl) {
      keeper.namePl = e.namePl;
      if (keeper.src !== 'og') og.polishNames[keeper.id] = e.namePl;
    }
    const names = [e.name, e.namePl].filter((n): n is string => !!n && n !== keeper.name && n !== keeper.namePl);
    aliases[keeper.id] = [...new Set([...(aliases[keeper.id] ?? []), ...names])];
  }
  if (sorted.slice(1).some((e) => removed.has(e.id)) && examples.length < 25) examples.push(`- **${keeper.name}** ← ${sorted.slice(1).map((e) => e.name).join(', ')}`);
}
// Keep merged targets pointing at final keepers (a keeper can itself be merged on a later run).
for (const [from, to] of Object.entries(merged)) {
  let t = to;
  while (merged[t] && merged[t] !== t) t = merged[t];
  merged[from] = t;
}

const xRemoved = [...removed].filter((id) => id.startsWith('x-'));
const before = og.added.length + xRemoved.length;
og.added = og.added
  .filter((e) => !removed.has(e.id))
  .map((e) => {
    const k = all.find((x) => x.id === e.id) as Ex;
    return k.namePl && !e.namePl ? { ...e, namePl: k.namePl } : e;
  });
og.aliases = aliases;
writeFileSync(OG_PATH, JSON.stringify(og));
writeFileSync('src/data/exercise-merged.json', JSON.stringify(merged, null, 1) + '\n');

const exactRemoved = exact.flat().filter((e) => removed.has(e.id)).length;
const report = `# Duplikaty w bazie ćwiczeń

Wygenerowane przez \`node scripts/dedupe-exercises.ts\` (${new Date().toISOString().slice(0, 10)}).

Porównanie: znormalizowana nazwa (małe litery, bez interpunkcji, liczba pojedyncza, dowolna kolejność słów,
synonimy: pulldown/pull down, db/dumbbell, ez bar/ez-bar, lever/machine, smith/smith machine, one/single arm, „v. 2”
i „(plate loaded)” pomijane) + ten sam sprzęt + ten sam główny mięsień.

| | Liczba |
|---|---|
| Ćwiczenia przed scaleniem (free-exercise-db + własne x- + openGym) | ${all.length} |
| Grupy identyczne po normalizacji | ${exact.length} |
| Wpisy usunięte automatycznie (identyczne) | ${exactRemoved} |
| Pary podobne do przejrzenia | ${near.length} |
| …uznane za to samo ćwiczenie (scalone) | ${nearMerged} |
| …uznane za inny wariant (zostają osobno) | ${near.length - nearMerged - pending.length} |
| …nierozstrzygnięte (do decyzji w scripts/dedupe-review.json) | ${pending.length} |
| Wpisy usunięte łącznie (openGym i własne x-) | ${before - og.added.length} |
| Duplikaty wewnątrz samej free-exercise-db (zostawione: oba mają zdjęcia i mogą być w planach) | ${protectedPairs} |
| Ćwiczeń po scaleniu | ${all.length - (before - og.added.length)} |

Zostaje jedno ćwiczenie na ruch: najpierw id z free-exercise-db (ma zdjęcia), potem własne x-, potem openGym.
Nazwy usuniętych wpisów (angielskie i polskie) są aliasami — wyszukiwanie i import znajdują je pod każdą nazwą.
Kto miał już w planie lub historii usunięty wpis, dostaje go przepięty na zachowane ćwiczenie (aktualizacja bazy).

## Przykłady scaleń

${examples.join('\n')}

## Przykłady odrzucone przy przeglądzie (różne warianty)

${review.different.slice(0, 10).map(([a, b]) => `- ${a} ≠ ${b}`).join('\n')}
${pending.length ? `\n## Nierozstrzygnięte\n\n${pending.map(([a, b, w]) => `- ${a} ~ ${b} [${w}]`).join('\n')}\n` : ''}`;
writeFileSync('docs/exercise-duplicates.md', report);
console.log(`removed ${before - og.added.length} (exact ${exactRemoved}, reviewed ${nearMerged} pairs), pending ${pending.length}, kept ${og.added.length}`);
