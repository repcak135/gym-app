// Crash reports from the app: one Durable Object ("log") keeps the newest 500 reports, at most 30 days.

export interface ListStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(keys: string | string[]): Promise<boolean | number>;
  list<T>(options?: { prefix?: string; reverse?: boolean; limit?: number }): Promise<Map<string, T>>;
}

export type ErrorReport = {
  version: string;
  message: string;
  stack: string;
  path: string;
  device: string;
  at: number;
  receivedAt: number;
};

export const MAX_REPORTS = 500;
export const MAX_AGE_MS = 30 * 24 * 3600_000;
export const PER_IP_PER_MINUTE = 10;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
// Drops "?query" from URLs; keeps the ":line:col" of stack frames.
const noQuery = (s: string) => s.replace(/\?[^\s#):]*/g, '');

/** Cleans a report from the app; anything else in the body is dropped. */
export function parseReport(v: unknown, now: number): ErrorReport | null {
  const b = v as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return null;
  const message = noQuery(str(b.message, 500));
  if (!message) return null;
  const at = typeof b.at === 'number' && Number.isFinite(b.at) ? b.at : now;
  return {
    version: str(b.version, 20),
    message,
    stack: noQuery(str(b.stack, 2048)),
    path: str(b.path, 100).split('?')[0],
    device: str(b.device, 60),
    at,
    receivedAt: now,
  };
}

export class ErrorLogCore {
  private hits = new Map<string, number[]>(); // per IP, in memory only: IPs are never stored

  constructor(
    private storage: ListStorage,
    private now: () => number = Date.now,
  ) {}

  /** false when this IP sent too many reports in the last minute. */
  allow(ip: string): boolean {
    const now = this.now();
    const recent = (this.hits.get(ip) ?? []).filter((t) => t > now - 60_000);
    if (recent.length >= PER_IP_PER_MINUTE) return false;
    recent.push(now);
    this.hits.set(ip, recent);
    if (this.hits.size > 1000) this.hits.clear();
    return true;
  }

  async add(report: ErrorReport): Promise<void> {
    const key = `e:${String(report.receivedAt).padStart(15, '0')}:${Math.random().toString(36).slice(2, 8)}`;
    await this.storage.put(key, report);
    await this.prune();
  }

  private async prune(): Promise<void> {
    const all = await this.storage.list<ErrorReport>({ prefix: 'e:' }); // oldest first
    const cutoff = this.now() - MAX_AGE_MS;
    const keys = [...all.keys()];
    const drop = keys.filter((k, i) => i < keys.length - MAX_REPORTS || (all.get(k)?.receivedAt ?? 0) < cutoff);
    for (let i = 0; i < drop.length; i += 128) await this.storage.delete(drop.slice(i, i + 128));
  }

  /** Newest first. */
  async list(limit = 100): Promise<ErrorReport[]> {
    const m = await this.storage.list<ErrorReport>({ prefix: 'e:', reverse: true, limit: Math.min(Math.max(limit, 1), MAX_REPORTS) });
    return [...m.values()];
  }
}
