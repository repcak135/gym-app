import { PUSH_URL } from '../push/config';
import { ApiError } from '../ranking/api';

/** Same Worker as the push and the ranking. */
const BASE = PUSH_URL;

async function req(method: string, path: string, token: string, body?: BodyInit, contentType = 'text/plain', extra: Record<string, string> = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType, ...extra }, body });
  } catch {
    throw new ApiError(0);
  }
  if (!res.ok) {
    const err = new ApiError(res.status);
    try {
      err.code = ((await res.json()) as { error?: string }).error;
    } catch {
      // no body
    }
    throw err;
  }
  return res;
}

export const cloudApi = {
  getKeys: async (token: string) => (await (await req('GET', '/backup/keys', token)).json()) as { pwWrapped: string; keyId: string; lastBackupAt: number | null },
  putKeys: (token: string, pwWrapped: string, adminWrapped: string, keyId: string) => req('POST', '/backup/keys', token, JSON.stringify({ pwWrapped, adminWrapped, keyId })),
  upload: async (token: string, data: Uint8Array<ArrayBuffer>, keyId: string) =>
    (await (await req('PUT', '/backup', token, data, 'application/octet-stream', { 'X-Key-Id': keyId })).json()) as { at: number; size: number },
  latest: async (token: string) => {
    const res = await req('GET', '/backup/latest', token);
    return { at: Number(res.headers.get('X-Backup-At')) || 0, data: new Uint8Array(await res.arrayBuffer()) };
  },
  list: async (token: string) => (await (await req('GET', '/backup/list', token)).json()) as { at: number; size: number }[],
  remove: (token: string) => req('DELETE', '/backup', token),
  stats: (token: string, items: { id: string; name: string; sets: number }[]) => req('POST', '/stats/exercises', token, JSON.stringify({ items })),
};
