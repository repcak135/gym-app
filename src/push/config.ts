/** Rest-end push server (Cloudflare Worker) and its public VAPID key, from .env.production. */
export const PUSH_URL: string = import.meta.env.VITE_PUSH_URL ?? '';
export const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

export function pushConfigured(): boolean {
  return PUSH_URL !== '' && VAPID_PUBLIC_KEY !== '';
}
