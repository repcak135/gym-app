// Friends' ranking accounts on D1. The phone derives a PBKDF2 key from the password and sends only
// that key; we store SHA-256(serverSalt || key). Session tokens are stored only as SHA-256.

export interface RankEnv {
  DB: D1Database;
  /** Secret: admin scripts (reset / remove a member). */
  ADMIN_TOKEN?: string;
  /** Secret: HMAC key for the fake salts of unknown nicks (separate from ADMIN_TOKEN). */
  SALT_SECRET?: string;
  /** Optional secret: when set, joining needs this code. */
  JOIN_CODE?: string;
}

export const ITERATIONS = 300_000;
export const NICK_RE = /^[A-Za-z0-9ĄĆĘŁŃÓŚŹŻąćęłńóśźż_-]{3,20}$/;
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 2_000_000;
const FAIL_WINDOW_MS = 15 * 60_000;
const FAILS_PER_NICK = 5;
const FAILS_PER_IP = 20;
const JOINS_PER_IP_HOUR = 5;
const SCORE_MAX_AGE_MS = 92 * 24 * 3600_000;
const SESSION_MAX_AGE_MS = 365 * 24 * 3600_000;

type Member = {
  id: number;
  nick: string;
  client_salt: string;
  iterations: number;
  server_salt: string;
  hash: string;
  must_change: number;
  share_workouts: number;
  share_bench: number;
};

export type Res = { status: number; body?: unknown };
const ok = (body?: unknown): Res => ({ status: body === undefined ? 204 : 200, body });
const fail = (status: number, error?: string): Res => ({ status, body: error ? { error } : undefined });

// ---------- helpers ----------

const enc = new TextEncoder();

function hex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

function randomHex(bytes: number): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function sameSecret(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Nick as typed (NFC, trimmed) and the key used for uniqueness. null when invalid. */
export function normNick(v: unknown): { nick: string; lower: string } | null {
  if (typeof v !== 'string') return null;
  const nick = v.normalize('NFC').trim();
  // Latin letters with Polish diacritics only: no look-alike letters from other scripts (impersonation).
  if (!NICK_RE.test(nick)) return null;
  return { nick, lower: nick.toLocaleLowerCase('pl') };
}

const isB64u = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.length >= min && v.length <= max && /^[A-Za-z0-9_-]+$/.test(v);
const isKey = (v: unknown): v is string => isB64u(v, 43, 43); // 32 bytes
const isSalt = (v: unknown): v is string => isB64u(v, 22, 22); // 16 bytes
const isIterations = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= MIN_ITERATIONS && (v as number) <= MAX_ITERATIONS;
const isWeek = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(v);
const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const count = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;

async function fakeSalt(lower: string, secret: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(`salt:${lower}`))).slice(0, 16);
  let s = '';
  for (const x of mac) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function passwordHash(serverSalt: string, key: string): Promise<string> {
  return sha256Hex(`${serverSalt}:${key}`);
}

async function newSession(db: D1Database, memberId: number, now: number): Promise<string> {
  const token = randomHex(16);
  await db.prepare('INSERT INTO sessions (token_hash, member_id, created_at, last_used) VALUES (?, ?, ?, ?)').bind(await sha256Hex(token), memberId, now, now).run();
  return token;
}

async function fails(db: D1Database, key: string, now: number): Promise<number> {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE key = ? AND at > ?').bind(key, now - FAIL_WINDOW_MS).first<{ n: number }>();
  return r?.n ?? 0;
}

async function note(db: D1Database, key: string, now: number): Promise<void> {
  await db.batch([
    db.prepare('INSERT INTO attempts (key, at) VALUES (?, ?)').bind(key, now),
    db.prepare('DELETE FROM attempts WHERE at < ?').bind(now - 3600_000),
  ]);
}

const memberView = (m: Member) => ({ nick: m.nick, shareWorkouts: !!m.share_workouts, shareBench: !!m.share_bench, mustChange: !!m.must_change });

async function memberByToken(db: D1Database, auth: string | null, now: number): Promise<Member | null> {
  const token = (auth ?? '').replace(/^Bearer /, '');
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const th = await sha256Hex(token);
  const m = await db
    .prepare('SELECT m.* FROM sessions s JOIN members m ON m.id = s.member_id WHERE s.token_hash = ? AND s.last_used > ?')
    .bind(th, now - SESSION_MAX_AGE_MS)
    .first<Member>();
  if (m) await db.prepare('UPDATE sessions SET last_used = ? WHERE token_hash = ?').bind(now, th).run();
  return m;
}

// ---------- routes ----------

export type RankRequest = {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Record<string, unknown>;
  auth: string | null;
  ip: string;
  now: number;
};

export async function rankRoute(r: RankRequest, env: RankEnv): Promise<Res | null> {
  const db = env.DB;
  const { body: b, now } = r;
  const ipKey = await sha256Hex(`ip:${r.ip}`);
  const route = `${r.method} ${r.path}`;

  switch (route) {
    case 'GET /account/salt': {
      const n = normNick(r.query.get('nick'));
      if (!n) return fail(400);
      const m = await db.prepare('SELECT client_salt, iterations FROM members WHERE nick_lower = ?').bind(n.lower).first<Member>();
      // Unknown nick: a stable fake salt, so this endpoint does not tell which nicks exist (login then fails with 401).
      if (m) return ok({ salt: m.client_salt, iterations: m.iterations });
      // Without the secret: a plain 404 (never a constant key).
      return env.SALT_SECRET ? ok({ salt: await fakeSalt(n.lower, env.SALT_SECRET), iterations: ITERATIONS }) : fail(404);
    }

    case 'POST /account/join': {
      if (env.JOIN_CODE && !sameSecret(String(b.code ?? ''), env.JOIN_CODE)) return fail(403, 'code');
      const n = normNick(b.nick);
      if (!n || !isSalt(b.salt) || !isIterations(b.iterations) || !isKey(b.key)) return fail(400);
      const joinsLastHour = await db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE key = ? AND at > ?').bind(`join:${ipKey}`, now - 3600_000).first<{ n: number }>();
      if ((joinsLastHour?.n ?? 0) >= JOINS_PER_IP_HOUR) return fail(429);
      const exists = await db.prepare('SELECT 1 AS x FROM members WHERE nick_lower = ?').bind(n.lower).first();
      if (exists) return fail(409, 'nick');
      const serverSalt = randomHex(16);
      let res: D1Result;
      try {
        res = await db
          .prepare(
            'INSERT INTO members (nick, nick_lower, client_salt, iterations, server_salt, hash, share_workouts, share_bench, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(n.nick, n.lower, b.salt, b.iterations, serverSalt, await passwordHash(serverSalt, b.key), b.shareWorkouts ? 1 : 0, b.shareBench ? 1 : 0, now)
          .run();
      } catch {
        return fail(409, 'nick'); // two joins with the same nick at once: the UNIQUE index wins
      }
      await note(db, `join:${ipKey}`, now);
      const token = await newSession(db, Number(res.meta.last_row_id), now);
      return ok({ token, nick: n.nick });
    }

    case 'POST /account/login': {
      const n = normNick(b.nick);
      if (!n || !isKey(b.key)) return fail(400);
      // Record the attempt BEFORE checking (parallel guesses cannot slip past the limit), count it,
      // and remove it again only after a correct password.
      const nickKey = `nick:${n.lower}`;
      const ipK = `ip:${ipKey}`;
      const [a1, a2] = await db.batch([
        db.prepare('INSERT INTO attempts (key, at) VALUES (?, ?)').bind(nickKey, now),
        db.prepare('INSERT INTO attempts (key, at) VALUES (?, ?)').bind(ipK, now),
        db.prepare('DELETE FROM attempts WHERE at < ?').bind(now - 3600_000),
      ]);
      const mine = db.prepare('DELETE FROM attempts WHERE rowid IN (?, ?)').bind(a1.meta.last_row_id, a2.meta.last_row_id);
      if ((await fails(db, nickKey, now)) > FAILS_PER_NICK || (await fails(db, ipK, now)) > FAILS_PER_IP) {
        // A refused attempt does not extend the lock: it ends 15 minutes after the 5th wrong password.
        await mine.run();
        return fail(429);
      }
      const m = await db.prepare('SELECT * FROM members WHERE nick_lower = ?').bind(n.lower).first<Member>();
      // Same work for an unknown nick, so timing does not tell which nicks exist.
      const h = await passwordHash(m?.server_salt ?? 'x', b.key);
      if (!m || !sameSecret(h, m.hash)) return fail(401);
      await mine.run();
      return ok({ token: await newSession(db, m.id, now), ...memberView(m) });
    }

    case 'POST /admin/reset':
    case 'POST /admin/remove': {
      const token = (r.auth ?? '').replace(/^Bearer /, '');
      if (!env.ADMIN_TOKEN || !sameSecret(token, env.ADMIN_TOKEN)) return fail(401);
      const n = normNick(b.nick);
      if (!n) return fail(400);
      const m = await db.prepare('SELECT id FROM members WHERE nick_lower = ?').bind(n.lower).first<{ id: number }>();
      if (!m) return fail(404);
      if (route === 'POST /admin/remove') {
        await deleteMember(db, m.id);
        return ok();
      }
      if (!isSalt(b.salt) || !isIterations(b.iterations) || !isKey(b.key)) return fail(400);
      const serverSalt = randomHex(16);
      await db.batch([
        db
          .prepare('UPDATE members SET client_salt = ?, iterations = ?, server_salt = ?, hash = ?, must_change = 1 WHERE id = ?')
          .bind(b.salt, b.iterations, serverSalt, await passwordHash(serverSalt, b.key), m.id),
        db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(m.id),
        db.prepare("DELETE FROM attempts WHERE key = ?").bind(`nick:${n.lower}`),
      ]);
      return ok();
    }
  }

  // Everything below needs a session.
  const authed = ['GET /account/me', 'POST /account/password', 'POST /account/sharing', 'DELETE /account/session', 'DELETE /account', 'POST /scores', 'GET /ranking'];
  if (!authed.includes(route)) return null;
  const m = await memberByToken(db, r.auth, now);
  if (!m) return fail(401);

  switch (route) {
    case 'GET /account/me':
      return ok(memberView(m));

    case 'POST /account/password': {
      // The session token proves ownership ("Zapomniałem hasła" on a logged-in phone).
      if (!isSalt(b.salt) || !isIterations(b.iterations) || !isKey(b.key)) return fail(400);
      const serverSalt = randomHex(16);
      const keep = await sha256Hex((r.auth ?? '').replace(/^Bearer /, ''));
      await db.batch([
        db
          .prepare('UPDATE members SET client_salt = ?, iterations = ?, server_salt = ?, hash = ?, must_change = 0 WHERE id = ?')
          .bind(b.salt, b.iterations, serverSalt, await passwordHash(serverSalt, b.key), m.id),
        db.prepare('DELETE FROM sessions WHERE member_id = ? AND token_hash != ?').bind(m.id, keep),
      ]);
      return ok();
    }

    case 'POST /account/sharing': {
      const w = b.shareWorkouts ? 1 : 0;
      const be = b.shareBench ? 1 : 0;
      const stmts = [db.prepare('UPDATE members SET share_workouts = ?, share_bench = ? WHERE id = ?').bind(w, be, m.id)];
      if (!w) stmts.push(db.prepare("DELETE FROM scores WHERE member_id = ? AND metric = 'workouts'").bind(m.id));
      if (!be) stmts.push(db.prepare('DELETE FROM records WHERE member_id = ?').bind(m.id));
      await db.batch(stmts);
      return ok();
    }

    case 'DELETE /account/session':
      await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex((r.auth ?? '').replace(/^Bearer /, ''))).run();
      return ok();

    case 'DELETE /account':
      await deleteMember(db, m.id);
      return ok();

    case 'POST /scores': {
      if (!isWeek(b.week) || !isMonth(b.month)) return fail(400);
      const stmts: D1PreparedStatement[] = [];
      const put = (metric: string, period: string, value: unknown, max: number) => {
        if (value === undefined || value === null) {
          stmts.push(db.prepare('DELETE FROM scores WHERE member_id = ? AND metric = ? AND period = ?').bind(m.id, metric, period));
        } else if (count(value, max)) {
          stmts.push(
            db
              .prepare(
                'INSERT INTO scores (member_id, metric, period, value, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (member_id, metric, period) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
              )
              .bind(m.id, metric, period, Math.round(value * 100) / 100, now),
          );
        }
      };
      // The phone always sends its current truth; a missing value removes the row (an edit can lower a score).
      if (m.share_workouts) {
        put('workouts', b.week, b.workoutsWeek, 100);
        put('workouts', b.month, b.workoutsMonth, 400);
      }
      if (m.share_bench) {
        // All-time best bench DOTS: one row per member; a missing value removes it (an edit can lower it).
        if (b.benchBest === undefined || b.benchBest === null) {
          stmts.push(db.prepare("DELETE FROM records WHERE member_id = ? AND exercise = 'bench'").bind(m.id));
        } else if (count(b.benchBest, 1000)) {
          stmts.push(
            db
              .prepare(
                "INSERT INTO records (member_id, exercise, value, updated_at) VALUES (?, 'bench', ?, ?) ON CONFLICT (member_id, exercise) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
              )
              .bind(m.id, Math.round(b.benchBest * 100) / 100, now),
          );
        }
      }
      stmts.push(db.prepare('DELETE FROM scores WHERE updated_at < ?').bind(now - SCORE_MAX_AGE_MS));
      await db.batch(stmts);
      return ok();
    }

    case 'GET /ranking': {
      const week = r.query.get('week');
      const month = r.query.get('month');
      if (!isWeek(week) || !isMonth(month)) return fail(400);
      const workouts = async (period: string) =>
        (
          await db
            .prepare(
              "SELECT m.nick AS nick, COALESCE(s.value, 0) AS value FROM members m LEFT JOIN scores s ON s.member_id = m.id AND s.metric = 'workouts' AND s.period = ? WHERE m.share_workouts = 1 ORDER BY value DESC, m.nick_lower LIMIT 200",
            )
            .bind(period)
            .all<{ nick: string; value: number }>()
        ).results;
      const bench = (
        await db
          .prepare(
            "SELECT m.nick AS nick, r.value AS value FROM records r JOIN members m ON m.id = r.member_id WHERE r.exercise = 'bench' AND m.share_bench = 1 ORDER BY r.value DESC, m.nick_lower LIMIT 200",
          )
          .all<{ nick: string; value: number }>()
      ).results;
      // week.bench / month.bench stay as empty lists so 0.9.20 apps keep working until they update.
      return ok({ me: m.nick, week: { workouts: await workouts(week), bench: [] }, month: { workouts: await workouts(month), bench: [] }, bench });
    }
  }
  return null;
}

async function deleteMember(db: D1Database, id: number): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM scores WHERE member_id = ?').bind(id),
    db.prepare('DELETE FROM records WHERE member_id = ?').bind(id),
    db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(id),
    db.prepare('DELETE FROM members WHERE id = ?').bind(id),
  ]);
}
