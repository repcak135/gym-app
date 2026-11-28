// Cloud backup routes. The Worker stores ciphertext in R2 and wrapped keys in D1; it never decrypts.
// Hard caps keep everything far inside R2's free tier (10 GB-month, 1 M Class A, 10 M Class B):
// the owner's account has a payment card, so nothing may ever become billable.
import {
  deleteMember,
  isIterations,
  isKey,
  isPwWrapped,
  isSalt,
  memberByToken,
  normNick,
  passwordHash,
  randomHex,
  sameSecret,
  type RankEnv,
} from './accounts';

export const MAX_UPLOAD = 10 * 1024 * 1024;
export const KEEP_PER_MEMBER = 3;
export const MAX_MEMBER_BYTES = 30 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 5 * 1024 ** 3;
export const UPLOADS_PER_DAY = 20;
export const UPLOADS_PER_MONTH = 20_000;
export const DOWNLOADS_PER_MONTH = 2_000;
export const STATS_PER_DAY = 20;
const COUNTER_MAX_AGE_MS = 40 * 24 * 3600_000;
const MAGIC = [0x42, 0x47, 0x42, 0x31]; // "BGB1"

const day = (now: number) => new Date(now).toISOString().slice(0, 10);
const month = (now: number) => new Date(now).toISOString().slice(0, 7);

function json(status: number, headers: Record<string, string>, body?: unknown): Response {
  return body === undefined
    ? new Response(null, { status, headers })
    : new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

/** +1 and the new value; old counters are cleaned up along the way. */
async function bump(db: D1Database, key: string, now: number): Promise<number> {
  const r = await db
    .prepare('INSERT INTO counters (key, n, at) VALUES (?, 1, ?) ON CONFLICT (key) DO UPDATE SET n = n + 1, at = excluded.at RETURNING n')
    .bind(key, now)
    .first<{ n: number }>();
  return r?.n ?? 1;
}

async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get('Content-Length') ?? 0) > 64 * 1024) return null;
  const text = await req.text();
  if (text.length > 64 * 1024) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function isAdminWrapped(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 1000) return false;
  try {
    const w = JSON.parse(v) as Record<string, unknown>;
    return w.v === 1 && w.kind === 'admin' && typeof w.kid === 'string' && /^[\w-]{1,40}$/.test(w.kid) && typeof w.epk === 'string' && typeof w.iv === 'string' && typeof w.ct === 'string';
  } catch {
    return false;
  }
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, max) : '');

async function memberObjects(db: D1Database, memberId: number) {
  return (
    await db.prepare('SELECT object_key, created_at, size FROM backups WHERE member_id = ? ORDER BY created_at DESC').bind(memberId).all<{ object_key: string; created_at: number; size: number }>()
  ).results;
}

/** Routes under /backup and /stats (session token). null = not ours. */
export async function cloudRoute(req: Request, env: RankEnv, now: number, h: Record<string, string>): Promise<Response | null> {
  const url = new URL(req.url);
  const route = `${req.method} ${url.pathname}`;
  const routes = ['PUT /backup', 'GET /backup/latest', 'GET /backup/list', 'DELETE /backup', 'POST /backup/keys', 'GET /backup/keys', 'POST /stats/exercises'];
  if (!routes.includes(route)) return null;
  const db = env.DB;
  const m = await memberByToken(db, req.headers.get('Authorization'), now);
  if (!m) return json(401, h);

  switch (route) {
    case 'PUT /backup': {
      // The upload must use the account's current backup key: a phone with an old key (cloud backup was
      // switched off and on elsewhere) would otherwise push out backups the others can open.
      const k = await db.prepare('SELECT key_id FROM backup_keys WHERE member_id = ?').bind(m.id).first<{ key_id: string }>();
      if (!k || k.key_id !== req.headers.get('X-Key-Id')) return json(409, h, { error: 'keys' });
      if (Number(req.headers.get('Content-Length') ?? 0) > MAX_UPLOAD) return json(413, h, { error: 'size' });
      const data = new Uint8Array(await req.arrayBuffer());
      if (data.length > MAX_UPLOAD) return json(413, h, { error: 'size' });
      if (data.length < 33 || MAGIC.some((b, i) => data[i] !== b)) return json(400, h);
      // Caps are counted before the write, so parallel uploads cannot slip past them.
      if ((await bump(db, `up:${m.id}:${day(now)}`, now)) > UPLOADS_PER_DAY) return json(429, h, { error: 'daily' });
      if ((await bump(db, `up:all:${month(now)}`, now)) > UPLOADS_PER_MONTH) return json(429, h, { error: 'monthly' });
      const total = (await db.prepare('SELECT COALESCE(SUM(size), 0) AS s FROM backups').first<{ s: number }>())?.s ?? 0;
      if (total + data.length > MAX_TOTAL_BYTES) return json(507, h, { error: 'full' });
      const mine = await memberObjects(db, m.id);
      const kept = mine.slice(0, KEEP_PER_MEMBER - 1);
      if (kept.reduce((n, o) => n + o.size, 0) + data.length > MAX_MEMBER_BYTES) return json(413, h, { error: 'member' });
      const key = `backups/${m.id}/${now}-${randomHex(4)}.bin`;
      await env.BACKUPS.put(key, data, { httpMetadata: { contentType: 'application/octet-stream' } });
      const drop = mine.slice(KEEP_PER_MEMBER - 1).map((o) => o.object_key);
      if (drop.length) await env.BACKUPS.delete(drop);
      await db.batch([
        db.prepare('INSERT INTO backups (object_key, member_id, created_at, size) VALUES (?, ?, ?, ?)').bind(key, m.id, now, data.length),
        ...drop.map((k) => db.prepare('DELETE FROM backups WHERE object_key = ?').bind(k)),
        db.prepare('DELETE FROM counters WHERE at < ?').bind(now - COUNTER_MAX_AGE_MS),
      ]);
      // Parallel uploads all saw the old list: trim again after the write, so at most 3 objects and
      // 30 MB stay, whatever arrived at the same time.
      const after = await memberObjects(db, m.id);
      const extra = after.slice(KEEP_PER_MEMBER);
      const keptNow = after.slice(0, KEEP_PER_MEMBER);
      if (keptNow.reduce((n, o) => n + o.size, 0) > MAX_MEMBER_BYTES) extra.push(...keptNow.filter((o) => o.object_key === key));
      if (extra.length) {
        await env.BACKUPS.delete(extra.map((o) => o.object_key));
        await db.batch(extra.map((o) => db.prepare('DELETE FROM backups WHERE object_key = ?').bind(o.object_key)));
        if (extra.some((o) => o.object_key === key)) return json(413, h, { error: 'member' });
      }
      return json(200, h, { at: now, size: data.length });
    }

    case 'GET /backup/latest': {
      const newest = (await memberObjects(db, m.id))[0];
      if (!newest) return json(404, h);
      if ((await bump(db, `down:${m.id}:${month(now)}`, now)) > DOWNLOADS_PER_MONTH) return json(429, h, { error: 'downloads' });
      const obj = await env.BACKUPS.get(newest.object_key);
      if (!obj) return json(404, h);
      return new Response(obj.body, {
        status: 200,
        headers: { ...h, 'Content-Type': 'application/octet-stream', 'X-Backup-At': String(newest.created_at), 'Access-Control-Expose-Headers': 'X-Backup-At' },
      });
    }

    case 'GET /backup/list':
      return json(200, h, (await memberObjects(db, m.id)).map((o) => ({ at: o.created_at, size: o.size })));

    case 'DELETE /backup': {
      const keys = (await memberObjects(db, m.id)).map((o) => o.object_key);
      if (keys.length) await env.BACKUPS.delete(keys);
      await db.batch([db.prepare('DELETE FROM backups WHERE member_id = ?').bind(m.id), db.prepare('DELETE FROM backup_keys WHERE member_id = ?').bind(m.id)]);
      return json(204, h);
    }

    case 'GET /backup/keys': {
      const k = await db.prepare('SELECT pw_wrapped, key_id FROM backup_keys WHERE member_id = ?').bind(m.id).first<{ pw_wrapped: string; key_id: string }>();
      if (!k) return json(404, h);
      return json(200, h, { pwWrapped: k.pw_wrapped, keyId: k.key_id, lastBackupAt: (await memberObjects(db, m.id))[0]?.created_at ?? null });
    }

    case 'POST /backup/keys': {
      const b = await readJsonBody(req);
      if (!b || !isPwWrapped(b.pwWrapped) || !isAdminWrapped(b.adminWrapped) || typeof b.keyId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(b.keyId)) return json(400, h);
      // Only the first phone creates the keys; later phones adopt them (a second key would orphan the backups).
      try {
        await db
          .prepare('INSERT INTO backup_keys (member_id, pw_wrapped, admin_wrapped, key_id, updated_at) VALUES (?, ?, ?, ?, ?)')
          .bind(m.id, b.pwWrapped, b.adminWrapped, b.keyId, now)
          .run();
      } catch {
        return json(409, h, { error: 'exists' });
      }
      return json(204, h);
    }

    case 'POST /stats/exercises': {
      const b = await readJsonBody(req);
      const items = b?.items;
      if (!Array.isArray(items) || items.length > 500) return json(400, h);
      if ((await bump(db, `stats:${m.id}:${day(now)}`, now)) > STATS_PER_DAY) return json(429, h);
      // No member id, no dates, no weights: only exercise id, name and a set count are added up.
      const stmts = [];
      for (const it of items as Record<string, unknown>[]) {
        const id = clean(it?.id, 80);
        const name = clean(it?.name, 80);
        const sets = it?.sets;
        if (!/^[\w.()'-]{1,80}$/.test(id) || !name || !Number.isInteger(sets) || (sets as number) < 1 || (sets as number) > 5000) continue;
        stmts.push(
          db
            .prepare('INSERT INTO exercise_stats (exercise_id, name, sets) VALUES (?, ?, ?) ON CONFLICT (exercise_id) DO UPDATE SET sets = sets + excluded.sets, name = excluded.name')
            .bind(id, name, sets as number),
        );
      }
      if (stmts.length) await db.batch(stmts);
      return json(204, h);
    }
  }
  return null;
}

/** Admin routes for the cloud backup (admin token; run from the owner's PC). null = not ours. */
export async function cloudAdminRoute(req: Request, env: RankEnv, now: number): Promise<Response | null> {
  const url = new URL(req.url);
  const route = `${req.method} ${url.pathname}`;
  const routes = ['GET /admin/backup-keys', 'POST /admin/backup-keys', 'GET /admin/snapshot', 'GET /admin/backup-object'];
  if (!routes.includes(route)) return null;
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  if (!env.ADMIN_TOKEN || !sameSecret(token, env.ADMIN_TOKEN)) return json(401, {});
  const db = env.DB;

  switch (route) {
    case 'GET /admin/backup-keys': {
      const n = normNick(url.searchParams.get('nick'));
      if (!n) return json(400, {});
      const m = await db.prepare('SELECT id, nick FROM members WHERE nick_lower = ?').bind(n.lower).first<{ id: number; nick: string }>();
      if (!m) return json(404, {});
      const k = await db.prepare('SELECT admin_wrapped FROM backup_keys WHERE member_id = ?').bind(m.id).first<{ admin_wrapped: string }>();
      const objs = await memberObjects(db, m.id);
      return json(200, {}, { nick: m.nick, adminWrapped: k?.admin_wrapped ?? null, lastBackupAt: objs[0]?.created_at ?? null, backups: objs.length });
    }

    case 'POST /admin/backup-keys': {
      // admin-recover.mjs: temporary password + the backup key re-wrapped with it, in one batch.
      const b = await readJsonBody(req);
      const n = normNick(b?.nick);
      if (!b || !n || !isSalt(b.salt) || !isIterations(b.iterations) || !isKey(b.key) || !isPwWrapped(b.pwWrapped)) return json(400, {});
      const m = await db.prepare('SELECT id FROM members WHERE nick_lower = ?').bind(n.lower).first<{ id: number }>();
      if (!m) return json(404, {});
      if (!(await db.prepare('SELECT 1 AS x FROM backup_keys WHERE member_id = ?').bind(m.id).first())) return json(409, {}, { error: 'no-cloud' });
      const serverSalt = randomHex(16);
      await db.batch([
        db
          .prepare('UPDATE members SET client_salt = ?, iterations = ?, server_salt = ?, hash = ?, must_change = 1 WHERE id = ?')
          .bind(b.salt, b.iterations, serverSalt, await passwordHash(serverSalt, b.key), m.id),
        db.prepare('UPDATE backup_keys SET pw_wrapped = ?, updated_at = ? WHERE member_id = ?').bind(b.pwWrapped, now, m.id),
        db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(m.id),
        db.prepare('DELETE FROM attempts WHERE key = ?').bind(`nick:${n.lower}`),
      ]);
      return json(204, {});
    }

    case 'GET /admin/snapshot': {
      // Sessions and counters are left out: they are not needed to rebuild the server (people log in again).
      const tables = ['members', 'scores', 'records', 'backup_keys', 'backups', 'exercise_stats'];
      const out: Record<string, unknown[]> = {};
      // admin_wrapped is left out on purpose: the snapshot lands on Google Drive next to the admin private key,
      // and key + admin-wrapped keys + ciphertext together would open every backup. Without it a rebuilt
      // server still works with each member's password; only admin recovery for old backups is lost.
      const columns: Record<string, string> = { backup_keys: 'member_id, pw_wrapped, key_id, updated_at' };
      for (const t of tables) out[t] = (await db.prepare(`SELECT ${columns[t] ?? '*'} FROM ${t}`).all()).results;
      return json(200, {}, { at: now, tables: out });
    }

    case 'GET /admin/backup-object': {
      const key = url.searchParams.get('key') ?? '';
      if (!(await db.prepare('SELECT 1 AS x FROM backups WHERE object_key = ?').bind(key).first())) return json(404, {});
      const obj = await env.BACKUPS.get(key);
      return obj ? new Response(obj.body, { headers: { 'Content-Type': 'application/octet-stream' } }) : json(404, {});
    }
  }
  return null;
}

export { deleteMember };
