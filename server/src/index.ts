import { DeviceCore, type DeviceEnv, type StorageLike } from './device';
import { isId, MAX_BODY, newId, ORIGINS, parseSchedule, parseSubscription } from './validate';
import { ErrorLogCore, parseReport, type ListStorage } from './errors';
import { rankRoute, type RankEnv } from './accounts';
import { cloudAdminRoute, cloudRoute } from './cloud';

export interface Env extends DeviceEnv, RankEnv {
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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Key-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const ROUTES = ['POST /subscribe', 'DELETE /subscribe', 'POST /schedule', 'POST /cancel', 'POST /errors'];

const RANK_PREFIXES = ['/account', '/scores', '/ranking'];

async function readJson(req: Request): Promise<Record<string, unknown> | number> {
  // The app sends JSON as text/plain: keepalive requests then need no CORS preflight.
  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_BODY) return 413;
  const text = await req.text();
  if (text.length > MAX_BODY) return 413;
  if (text === '' && req.method !== 'POST') return {};
  try {
    const data = JSON.parse(text);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : 400;
  } catch {
    return 400;
  }
}

async function rank(req: Request, env: Env, now: number, headers: Record<string, string>): Promise<Response | null> {
  const url = new URL(req.url);
  const data = req.method === 'GET' ? {} : await readJson(req);
  if (typeof data === 'number') return new Response(null, { status: data, headers });
  const res = await rankRoute(
    { method: req.method, path: url.pathname, query: url.searchParams, body: data, auth: req.headers.get('Authorization'), ip: req.headers.get('CF-Connecting-IP') ?? 'unknown', now },
    env,
  );
  if (!res) return null;
  return res.body === undefined
    ? new Response(null, { status: res.status, headers })
    : new Response(JSON.stringify(res.body), { status: res.status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

export async function handle(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const pathname = new URL(req.url).pathname;
  if (req.method === 'GET' && pathname === '/errors') return readErrors(req, env);
  // Admin scripts run from the computer (no Origin); the admin token protects them.
  if (pathname.startsWith('/admin/')) {
    const cloud = await cloudAdminRoute(req, env, now);
    if (cloud) return cloud;
    return req.method === 'POST' ? ((await rank(req, env, now, {})) ?? new Response(null, { status: 404 })) : new Response(null, { status: 404 });
  }
  const origin = req.headers.get('Origin') ?? '';
  if (!ORIGINS.includes(origin)) return new Response('forbidden', { status: 403 });
  const h = cors(origin);
  const reply = (status: number, body?: object) =>
    new Response(body ? JSON.stringify(body) : null, { status, headers: body ? { ...h, 'Content-Type': 'application/json' } : h });
  if (req.method === 'OPTIONS') return reply(204);

  if (pathname === '/backup' || pathname.startsWith('/backup/') || pathname.startsWith('/stats/')) return (await cloudRoute(req, env, now, h)) ?? reply(404);
  if (RANK_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return (await rank(req, env, now, h)) ?? reply(404);

  const route = `${req.method} ${pathname}`;
  if (!ROUTES.includes(route)) return reply(404);

  const data = await readJson(req);
  if (typeof data === 'number') return reply(data);

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
