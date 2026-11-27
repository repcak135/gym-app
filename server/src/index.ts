import { DeviceCore, type DeviceEnv, type StorageLike } from './device';
import { isId, MAX_BODY, newId, ORIGINS, parseSchedule, parseSubscription } from './validate';
import { ErrorLogCore, parseReport, type ListStorage } from './errors';

export interface Env extends DeviceEnv {
  DEVICE: DurableObjectNamespace;
  ERRORS: DurableObjectNamespace;
  /** Secret (wrangler secret put ERRORS_TOKEN): reading crash reports needs it. */
  ERRORS_TOKEN?: string;
}

/** Durable Object bound in wrangler.toml: one instance ("log") holds the crash reports. */
export class ErrorLog {
  private core: ErrorLogCore;
  constructor(state: DurableObjectState) {
    this.core = new ErrorLogCore(state.storage as unknown as ListStorage);
  }
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/list') return Response.json(await this.core.list(Number(url.searchParams.get('limit') ?? 100)));
    const { ip, report } = (await req.json()) as { ip: string; report: Parameters<ErrorLogCore['add']>[0] };
    if (!this.core.allow(ip)) return new Response(null, { status: 429 });
    await this.core.add(report);
    return new Response(null, { status: 204 });
  }
}

function sameSecret(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** CLI only: GET /errors with "Authorization: Bearer <ERRORS_TOKEN>". */
async function readErrors(req: Request, env: Env): Promise<Response> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  if (!env.ERRORS_TOKEN || !sameSecret(token, env.ERRORS_TOKEN)) return new Response('unauthorized', { status: 401 });
  const limit = new URL(req.url).searchParams.get('limit') ?? '100';
  const log = env.ERRORS.get(env.ERRORS.idFromName('log'));
  return log.fetch(`https://log/list?limit=${encodeURIComponent(limit)}`);
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

const ROUTES = ['POST /subscribe', 'DELETE /subscribe', 'POST /schedule', 'POST /cancel', 'POST /errors'];

export async function handle(req: Request, env: Env, now = Date.now()): Promise<Response> {
  if (req.method === 'GET' && new URL(req.url).pathname === '/errors') return readErrors(req, env);
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

  if (route === 'POST /errors') {
    const report = parseReport(data, now);
    if (!report) return reply(400);
    const log = env.ERRORS.get(env.ERRORS.idFromName('log'));
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    return reply((await log.fetch('https://log/add', { method: 'POST', body: JSON.stringify({ ip, report }) })).status);
  }

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
