export const MAX_GROUP = 3;

/** Consecutive items with an equal `group` form one superset / circuit (only groups of >= 2 are returned). */
export function groupsOf(items: { group?: string }[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let i = 0;
  while (i < items.length) {
    const g = items[i].group;
    let j = i;
    if (g) while (j + 1 < items.length && items[j + 1].group === g) j++;
    if (j > i) out.push({ start: i, end: j });
    i = j + 1;
  }
  return out;
}

export function groupLabel(size: number): 'Superseria' | 'Obwód' {
  return size >= 3 ? 'Obwód' : 'Superseria';
}

export function newGroupId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** The group block (start..end) containing `index`, or null when the item is not grouped. */
export function groupAt(items: { group?: string }[], index: number): { start: number; end: number } | null {
  return groupsOf(items).find((g) => index >= g.start && index <= g.end) ?? null;
}

/**
 * Links item `index` with `index + 1`: reuses a group id of either, or makes a new one.
 * Returns the new items, or null when not possible (last item, or the result would exceed 3).
 */
export function linkItems<T extends { group?: string }>(items: T[], index: number): T[] | null {
  if (index < 0 || index + 1 >= items.length) return null;
  const a = items[index];
  const b = items[index + 1];
  if (a.group && a.group === b.group) return null;
  const ga = groupAt(items, index);
  const gb = groupAt(items, index + 1);
  const size = (g: { start: number; end: number } | null) => (g ? g.end - g.start + 1 : 1);
  if (size(ga) + size(gb) > MAX_GROUP) return null;
  const id = (ga ? a.group : undefined) ?? (gb ? b.group : undefined) ?? newGroupId();
  const next = items.map((it) => ({ ...it }));
  // Everything of the two blocks takes the same id.
  for (let i = ga?.start ?? index; i <= (ga?.end ?? index); i++) next[i].group = id;
  for (let i = gb?.start ?? index + 1; i <= (gb?.end ?? index + 1); i++) next[i].group = id;
  return next;
}

/** Removes item `index` from its group; a group left with one item dissolves. */
export function unlinkItems<T extends { group?: string }>(items: T[], index: number): T[] {
  const next = items.map((it) => ({ ...it }));
  if (next[index]) delete next[index].group;
  return normalizeGroups(next);
}

/** Moves an item; the moved item leaves its group unless it lands next to an item of the same group. */
export function moveGrouped<T extends { group?: string }>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = items.map((it) => ({ ...it }));
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  const g = moved.group;
  if (g && next[to - 1]?.group !== g && next[to + 1]?.group !== g) delete moved.group;
  return normalizeGroups(next);
}

/** Removes an item; its group loses it and dissolves when only one item is left. */
export function removeGrouped<T extends { group?: string }>(items: T[], index: number): T[] {
  return normalizeGroups(items.filter((_, i) => i !== index));
}

/** Drops ids of groups that are not 2+ consecutive items (after a move / removal). */
export function normalizeGroups<T extends { group?: string }>(items: T[]): T[] {
  const keep = new Set<number>();
  for (const g of groupsOf(items)) for (let i = g.start; i <= g.end; i++) keep.add(i);
  return items.map((it, i) => {
    if (!it.group || keep.has(i)) return it;
    const { group: _g, ...rest } = it;
    void _g;
    return rest as T;
  });
}

/**
 * Where to go after a set of item `index` was completed (remaining already excludes it).
 * next = next item of the group (cyclic, after index) with sets left, or null.
 * endOfRound = no later item of the group still has sets (or the item is not grouped).
 */
export function nextInRound(
  items: { group?: string }[],
  remaining: number[],
  index: number,
): { next: number | null; endOfRound: boolean } {
  const g = groupAt(items, index);
  if (!g) return { next: null, endOfRound: true };
  const size = g.end - g.start + 1;
  let next: number | null = null;
  for (let step = 1; step < size; step++) {
    const i = g.start + ((index - g.start + step) % size);
    if ((remaining[i] ?? 0) > 0) {
      next = i;
      break;
    }
  }
  let endOfRound = true;
  for (let i = index + 1; i <= g.end; i++) {
    if ((remaining[i] ?? 0) > 0) {
      endOfRound = false;
      break;
    }
  }
  return { next, endOfRound };
}
