import { sendPush, type PushSub, type Vapid } from './webpush';
import { MAX_SCHEDULES_PER_HOUR, type Pending } from './validate';

/** The parts of DurableObjectStorage the Device uses (lets tests pass an in-memory fake). */
export interface StorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  deleteAll(): Promise<void>;
  setAlarm(at: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

export interface DeviceEnv {
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

/** A push this late after the rest end is dropped: a stale "Koniec przerwy" is worse than none. */
const LATE_MS = 2 * 60 * 1000;
const status = (s: number) => new Response(null, { status: s });

/**
 * One Durable Object per device id. It holds only the push subscription and at most one
 * pending "Koniec przerwy" push; the alarm sends it and deletes it.
 */
export class DeviceCore {
  constructor(
    private storage: StorageLike,
    private env: DeviceEnv,
    private now: () => number = Date.now,
  ) {}

  async handle(op: string, data: Record<string, unknown>): Promise<Response> {
    switch (op) {
      case '/subscribe':
        await this.storage.put('sub', data.sub);
        return status(204);
      case '/schedule':
        return this.schedule(data.pending as Pending);
      case '/cancel':
        if (!(await this.storage.get('sub'))) return status(404);
        await this.storage.delete('pending');
        await this.storage.deleteAlarm();
        return status(204);
      case '/forget':
        await this.storage.deleteAlarm();
        await this.storage.deleteAll();
        return status(204);
      default:
        return status(404);
    }
  }

  private async schedule(pending: Pending): Promise<Response> {
    if (!(await this.storage.get<PushSub>('sub'))) return status(404);
    const now = this.now();
    const hits = ((await this.storage.get<number[]>('hits')) ?? []).filter((t) => t > now - 3600_000);
    if (hits.length >= MAX_SCHEDULES_PER_HOUR) return status(429);
    hits.push(now);
    await this.storage.put('hits', hits);
    await this.storage.put('pending', pending);
    await this.storage.setAlarm(pending.endsAt);
    return status(204);
  }

  async alarm(): Promise<void> {
    const pending = await this.storage.get<Pending>('pending');
    const sub = await this.storage.get<PushSub>('sub');
    await this.storage.delete('pending');
    if (!pending || !sub) return;
    if (this.now() - pending.endsAt > LATE_MS) return;
    const vapid: Vapid = { publicKey: this.env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(this.env.VAPID_PRIVATE_KEY), subject: this.env.VAPID_SUBJECT };
    try {
      const res = await sendPush(sub, { title: pending.title, body: pending.body, url: '#/trening' }, vapid);
      if (res.status === 404 || res.status === 410) await this.storage.deleteAll();
      else if (!res.ok) console.log(JSON.stringify({ push: 'failed', status: res.status }));
    } catch (e) {
      // Swallowed on purpose: a thrown alarm is retried minutes later.
      console.log(JSON.stringify({ push: 'error', message: String(e) }));
    }
  }
}
