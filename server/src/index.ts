import { DeviceCore, type DeviceEnv, type StorageLike } from './device';
import { isId, MAX_BODY, newId, ORIGINS, parseSchedule, parseSubscription } from './validate';

export interface Env extends DeviceEnv {
  DEVICE: DurableObjectNamespace;
}

/** Durable Object bound in wrangler.toml: one per device id. */
export class Device {
  private core: DeviceCore;
  constructor(state: DurableObjectState, env: Env) {
    this.core = new DeviceCore(state.storage as unknown as StorageLike, env);
  }
  async fetch(req: Request): Promise<Response> {
    return this.core.handle(new URL(req.url).pathname, (await req.json()) as Record<string, unknown>);
  }
  async alarm(): Promise<void> {
    return this.core.alarm();
  }
}

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const ROUTES = ['POST /subscribe', 'DELETE /subscribe', 'POST /schedule', 'POST /cancel'];

export async function handle(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const origin = req.headers.get('Origin') ?? '';
  if (!ORIGINS.includes(origin)) return new Response('forbidden', { status: 403 });
  const h = cors(origin);
  const reply = (status: number, body?: object) =>
    new Response(body ? JSON.stringify(body) : null, { status, headers: body ? { ...h, 'Content-Type': 'application/json' } : h });
  if (req.method === 'OPTIONS') return reply(204);

  const route = `${req.method} ${new URL(req.url).pathname}`;
  if (!ROUTES.includes(route)) return reply(404);

  // The app sends JSON as text/plain: keepalive requests then need no CORS preflight.
  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_BODY) return reply(413);
  const text = await req.text();
  if (text.length > MAX_BODY) return reply(413);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    return reply(400);
  }
  if (!data || typeof data !== 'object') return reply(400);

  const call = async (id: string, op: string, payload: object = {}) => {
    const stub = env.DEVICE.get(env.DEVICE.idFromName(id));
    return (await stub.fetch(`https://device${op}`, { method: 'POST', body: JSON.stringify(payload) })).status;
  };

  if (route === 'POST /subscribe') {
    const sub = parseSubscription(data.subscription);
    if (!sub) return reply(400);
    // A known id refreshes that device (pushsubscriptionchange); otherwise a new random id.
    const id = isId(data.id) ? data.id : newId();
    await call(id, '/subscribe', { sub });
    return reply(200, { id });
  }
  if (!isId(data.id)) return reply(400);
  if (route === 'DELETE /subscribe') return reply(await call(data.id, '/forget'));
  if (route === 'POST /cancel') return reply(await call(data.id, '/cancel'));
  const pending = parseSchedule(data, now);
  if (!pending) return reply(400);
  return reply(await call(data.id, '/schedule', { pending }));
}

export default { fetch: (req: Request, env: Env) => handle(req, env) };
