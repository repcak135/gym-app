import { updateSettings } from '../data/settings';
import { isIOS } from '../audio/backgroundRest';
import { PUSH_URL, VAPID_PUBLIC_KEY, pushConfigured } from './config';

/** Cache entry the service worker reads on pushsubscriptionchange to re-subscribe under the same id. */
export const PUSH_ID_CACHE = 'banana-push';
export const PUSH_ID_KEY = 'push-id';

export type PushSupport = 'ok' | 'needs-install' | 'unsupported';
export type EnableResult = 'ok' | 'denied' | 'unsupported' | 'error';

export const PUSH_ERRORS: Record<Exclude<EnableResult, 'ok'>, string> = {
  denied: 'Powiadomienia są zablokowane. Włącz je w Ustawieniach telefonu → Powiadomienia → Banana Gym i spróbuj ponownie.',
  unsupported: 'Ten telefon albo przeglądarka nie obsługuje powiadomień.',
  error: 'Nie udało się połączyć z serwerem powiadomień. Sprawdź internet i spróbuj ponownie.',
};

/** Running as the app added to the Home Screen (not a browser tab). */
export function standalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function pushSupport(): PushSupport {
  if (!pushConfigured()) return 'unsupported';
  // iPhone: web push exists only in the app added to the Home Screen (iOS 16.4+).
  if (isIOS() && !standalone()) return 'needs-install';
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window ? 'ok' : 'unsupported';
}

function keyBytes(b64u: string): Uint8Array<ArrayBuffer> {
  const t = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** JSON sent as text/plain: a "simple" CORS request, so keepalive needs no preflight. */
function post(path: string, body: object, method = 'POST', keepalive = false): Promise<Response> {
  return fetch(PUSH_URL + path, { method, keepalive, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
}

async function rememberId(id: string | null): Promise<void> {
  try {
    const c = await caches.open(PUSH_ID_CACHE);
    if (id) {
      await c.put(PUSH_ID_KEY, new Response(id));
      await c.put('meta', new Response(JSON.stringify({ url: PUSH_URL, vapid: VAPID_PUBLIC_KEY })));
    } else await c.delete(PUSH_ID_KEY);
  } catch {
    // no Cache Storage (tests, private mode): re-subscribe then gets a new id
  }
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 10_000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export async function enablePush(): Promise<EnableResult> {
  if (pushSupport() !== 'ok') return 'unsupported';
  try {
    if ((await Notification.requestPermission()) !== 'granted') return 'denied';
    const reg = await registration();
    if (!reg) return 'error';
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
    const res = await post('/subscribe', { subscription: sub.toJSON() });
    if (!res.ok) return 'error';
    const { id } = (await res.json()) as { id: string };
    await rememberId(id);
    await updateSettings({ restPush: true, pushId: id, pushPromptDone: true });
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function disablePush(id: string | undefined): Promise<void> {
  await updateSettings({ restPush: false, pushId: undefined, pushPromptDone: true });
  await rememberId(null);
  try {
    if (id) await post('/subscribe', { id }, 'DELETE');
    const reg = await registration();
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    // offline: the server forgets the device on its own once the push service answers 410
  }
}

/** Fired at the moment the app is hidden or the phone locks, so keepalive and no await. */
export function scheduleRestPush(id: string, endsAt: number, title: string, body: string): void {
  post('/schedule', { id, endsAt, title, body }, 'POST', true).catch(() => {});
}

/** Back on screen: the in-app timer takes over. A 404 means the server forgot this device. */
export function cancelRestPush(id: string): void {
  post('/cancel', { id }, 'POST', true)
    .then((res) => {
      if (res.status === 404) void updateSettings({ restPush: false, pushId: undefined });
    })
    .catch(() => {});
}
