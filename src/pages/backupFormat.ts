import type { BackupStatus } from '../data/backupShare';

export function formatBackupDate(t: number): string {
  return new Date(t).toLocaleString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function daysAgo(t: number, now = Date.now()): string {
  const d = Math.floor((now - t) / 86_400_000);
  if (d <= 0) return 'dzisiaj';
  if (d === 1) return 'wczoraj';
  return `${d} dni temu`;
}

export function backupButtonLabel(status: BackupStatus): string {
  if (status.kind === 'busy') return 'Przygotowuję…';
  if (status.kind === 'ready') return 'Zapisz plik';
  return 'Zrób kopię';
}
