import { db } from '../data/db';
import { createBackup, parseBackup, restoreBackup, type BackupFile } from '../data/backup';
import { updateSettings } from '../data/settings';
import { ApiError } from '../ranking/api';
import { api } from '../ranking/api';
import { deriveKey, UserError } from '../ranking/account';
import { cloudApi } from './api';
import { b64u, backupKeyId, decryptBackup, encryptBackup, newBackupKey, unb64u, unwrapWithPassword, wrapForAdmin, wrapWithPassword } from './crypto';
import { exerciseTotals, readBaseline, resetBaseline, statsDelta, writeBaseline } from './stats';

/** App owner's recovery public key (lock 2), from .env. The private key is only on the owner's PC. */
export const ADMIN_KEY: string = import.meta.env.VITE_ADMIN_RECOVERY_KEY ?? '';
export const ADMIN_KID: string = import.meta.env.VITE_ADMIN_RECOVERY_KID ?? '';

/** At most one automatic upload per 10 minutes. */
export const UPLOAD_GAP_MS = 10 * 60_000;

async function account() {
  const s = await db.settings.get('app');
  if (!s?.rankToken || !s.rankNick) throw new UserError('Najpierw zaloguj się w Rankingu (Statystyki › Ranking znajomych).');
  return s;
}

/** Polish text for cloud errors (caps, offline, wrong password). */
export function cloudErrorText(e: unknown): string {
  if (e instanceof UserError) return e.message;
  if (e instanceof ApiError) {
    if (e.status === 0) return 'Brak połączenia z internetem. Kopia zostaje w telefonie, wyślemy ją później.';
    if (e.code === 'daily') return 'Dzisiejszy limit kopii w chmurze się wyczerpał. Następna pójdzie jutro.';
    if (e.code === 'monthly' || e.code === 'full') return 'Serwer kopii jest chwilowo pełny. Kopia zostaje w telefonie — zrób też kopię do pliku.';
    if (e.code === 'downloads') return 'Limit pobrań kopii w tym miesiącu się wyczerpał.';
    if (e.code === 'size' || e.code === 'member') return 'Kopia jest za duża do chmury. Zrób kopię do pliku.';
    if (e.status === 401) return 'Sesja wygasła. Zaloguj się ponownie w Rankingu.';
    if (e.status === 404) return 'W chmurze nie ma jeszcze kopii.';
  }
  return 'Coś poszło nie tak. Spróbuj ponownie za chwilę.';
}

/** Cheap fingerprint of the data a backup holds: a finished or deleted workout, a new set or measurement changes it. */
export async function dataFingerprint(): Promise<string> {
  const [workouts, sets, body, plans] = await Promise.all([db.workouts.count(), db.sets.count(), db.body.count(), db.plans.count()]);
  let lastEnd = 0;
  await db.workouts.each((w) => {
    if ((w.endedAt ?? 0) > lastEnd) lastEnd = w.endedAt ?? 0;
  });
  return `${workouts}:${sets}:${body}:${plans}:${lastEnd}`;
}

/**
 * "Włącz kopię w chmurze". The password is checked by logging in again (BK must be wrapped with the
 * right one). If the account already has a backup key (another phone), this phone adopts it; a new
 * key would make the existing backups unreadable.
 */
export async function enableCloud(password: string, shareStats: boolean): Promise<void> {
  const s = await account();
  if (!ADMIN_KEY) throw new UserError('Ta wersja aplikacji nie ma klucza odzyskiwania. Zaktualizuj aplikację.');
  let token = s.rankToken!;
  try {
    const salt = await api.salt(s.rankNick!);
    const login = await api.login({ nick: s.rankNick!, key: await deriveKey(password, salt.salt, salt.iterations) });
    await api.logout(token).catch(() => {});
    token = login.token;
    await updateSettings({ rankToken: token });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw new UserError('Złe hasło.');
    throw e;
  }
  let bk: Uint8Array<ArrayBuffer>;
  let adopted = false;
  try {
    bk = await unwrapWithPassword((await cloudApi.getKeys(token)).pwWrapped, password);
    adopted = true;
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
    bk = newBackupKey();
    await cloudApi.putKeys(token, await wrapWithPassword(bk, password), await wrapForAdmin(bk, ADMIN_KEY, ADMIN_KID), await backupKeyId(bk));
  }
  await updateSettings({ cloudKey: b64u(bk), cloudOn: true, cloudShareStats: shareStats, cloudFingerprint: undefined });
  // A second phone: its history is already counted by the first one. The first phone sends its history once.
  if (adopted) await resetBaseline();
  else writeBaseline({});
  await uploadNow();
}

/** Encrypts the current backup and uploads it; then the anonymous exercise list (when allowed). */
export async function uploadNow(): Promise<number> {
  const s = await db.settings.get('app');
  if (!s?.cloudOn || !s.cloudKey || !s.rankToken) throw new UserError('Kopia w chmurze jest wyłączona.');
  const fingerprint = await dataFingerprint();
  const file = await createBackup();
  const bk = unb64u(s.cloudKey);
  const blob = await encryptBackup(JSON.stringify(file), bk);
  let r;
  try {
    r = await cloudApi.upload(s.rankToken, blob, await backupKeyId(bk));
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && e.code === 'keys') {
      // Switched off (or on again with a new key) on another phone: this phone's key is stale.
      await updateSettings({ cloudKey: undefined, cloudOn: undefined, cloudLastAt: undefined, cloudFingerprint: undefined });
      throw new UserError('Kopia w chmurze została wyłączona lub włączona od nowa na innym telefonie. Włącz ją tu ponownie swoim hasłem.');
    }
    throw e;
  }
  await updateSettings({ cloudLastAt: r.at, cloudFingerprint: fingerprint });
  if (s.cloudShareStats) await sendStats(s.rankToken).catch(() => {});
  return r.at;
}

async function sendStats(token: string): Promise<void> {
  const { totals, names } = await exerciseTotals();
  const delta = statsDelta(totals, names, readBaseline());
  if (delta.length) await cloudApi.stats(token, delta);
  writeBaseline(totals);
}

/** Downloads and opens the newest cloud backup (nothing on the phone changes yet). */
export async function downloadLatest(): Promise<{ file: BackupFile; at: number }> {
  const s = await account();
  if (!s.cloudKey) throw new UserError('Ten telefon nie ma klucza kopii. Włącz kopię w chmurze swoim hasłem.');
  const { at, data } = await cloudApi.latest(s.rankToken!);
  let json: string;
  try {
    json = await decryptBackup(data, unb64u(s.cloudKey));
  } catch {
    throw new UserError('Nie udało się otworzyć kopii (zły klucz). Wyloguj się i zaloguj ponownie.');
  }
  return { file: parseBackup(json), at };
}

/** Replaces the phone's data with the cloud backup (after the user confirmed the preview). */
export async function restoreFromCloud(file: BackupFile): Promise<void> {
  await restoreBackup(file);
  await resetBaseline();
  await updateSettings({ cloudFingerprint: await dataFingerprint() });
}

/** "Wyłącz kopię w chmurze": deletes the backups and keys on the server. */
export async function disableCloud(): Promise<void> {
  const s = await account();
  await cloudApi.remove(s.rankToken!);
  await updateSettings({ cloudKey: undefined, cloudOn: undefined, cloudLastAt: undefined, cloudFingerprint: undefined });
}

/** Newest workout on this phone that the cloud backup (made at `at`) does not hold. */
export async function newerLocalWorkouts(at: number): Promise<number> {
  return db.workouts.filter((w) => (w.endedAt ?? w.startedAt) > at).count();
}
