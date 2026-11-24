// Where the Ćwiczenia list was (search/filters, loaded rows, scroll) when an exercise was opened,
// so coming back puts you in the same place. sessionStorage: survives a reload, not a new app start.

const KEY = 'gym.exercisesList';
const MAX_AGE_MS = 60 * 60 * 1000;

export interface ListMemo {
  /** Query string of the list, e.g. "?q=bench&m=chest". */
  search: string;
  limit: number;
  scrollY: number;
  at: number;
}

export function saveListMemo(memo: Omit<ListMemo, 'at'>): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...memo, at: Date.now() }));
  } catch {
    // private mode / storage blocked: the list just opens at the top
  }
}

/** Returns the saved place once (it is cleared), or null when there is none or it is old. */
export function takeListMemo(now = Date.now()): ListMemo | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as ListMemo;
    if (typeof m.search !== 'string' || typeof m.limit !== 'number' || typeof m.scrollY !== 'number') return null;
    if (now - m.at > MAX_AGE_MS) return null;
    return m;
  } catch {
    return null;
  }
}
