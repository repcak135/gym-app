// Builds src/data/exercise-measure.json: which built-in exercises are timed, distance or cardio (reps = not listed).
//
// Input: a JSON list of openGym exercises computed from the catalogue flags
//   { hold: [[ogId, name]], distance: [[ogId, name]], cardio: [[ogId, name]] }
//   (hold: true -> time, track "distance" -> distance, category cardio -> timeDistance; ogId like "og-0463").
// Plus free-exercise-db: category cardio -> timeDistance, plank / wall sit / dead hang / l-sit / hollow hold names -> time.
// An openGym id counts when it is in our catalogue (exercises-og.json "added") or was merged into a kept exercise.
// When an exercise lands in several lists: time wins, then distance, then timeDistance.
//
// Usage: node scripts/build-measure.ts <og-measure.json>
import { readFileSync, writeFileSync } from 'node:fs';

type Pair = [string, string];
type OgList = { hold: Pair[]; distance: Pair[]; cardio: Pair[] };

const input = process.argv[2];
if (!input) throw new Error('Podaj ścieżkę do og-measure.json');
const list: OgList = JSON.parse(readFileSync(input, 'utf8'));
const og: { added: { id: string }[]; merged: Record<string, string> } = JSON.parse(
  readFileSync('src/data/exercises-og.json', 'utf8'),
);
const db: { id: string; name: string; category: string }[] = JSON.parse(readFileSync('src/data/exercise-db.json', 'utf8'));

const added = new Set(og.added.map((e) => e.id));
const ours = (ogId: string): string | null => (added.has(ogId) ? ogId : (og.merged[ogId] ?? null));

const time = new Set<string>();
const distance = new Set<string>();
const timeDistance = new Set<string>();
let skipped = 0;
const take = (pairs: Pair[], into: Set<string>) => {
  for (const [id] of pairs) {
    const mine = ours(id);
    if (mine) into.add(mine);
    else skipped++;
  }
};
take(list.hold, time);
take(list.distance, distance);
take(list.cardio, timeDistance);

const HOLD = /plank|wall sit|dead hang|l-sit|hollow (body )?hold/i;
for (const e of db) {
  if (HOLD.test(e.name)) time.add(e.id);
  else if (e.category === 'cardio') timeDistance.add(e.id);
}

// One measure per exercise: time > distance > timeDistance.
for (const id of time) {
  distance.delete(id);
  timeDistance.delete(id);
}
for (const id of distance) timeDistance.delete(id);

const sorted = (s: Set<string>) => [...s].sort();
const out = { time: sorted(time), distance: sorted(distance), timeDistance: sorted(timeDistance) };
writeFileSync('src/data/exercise-measure.json', JSON.stringify(out) + '\n');
console.log(`time ${out.time.length}, distance ${out.distance.length}, timeDistance ${out.timeDistance.length}, skipped (not in catalogue) ${skipped}`);
