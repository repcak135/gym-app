import { useState } from 'react';
import { backupFileName, createBackup, markBackupDone, type BackupFile } from './backup';
import { shareFile, type SaveResult } from './shareFile';

export type { SaveResult };

function toFile(backup: BackupFile): File {
  const json = JSON.stringify(backup);
  return new File([json], backupFileName(new Date(backup.exportedAt)), { type: 'application/json' });
}

/**
 * iPhone/Android: the share sheet ("Zachowaj w Plikach", Google Drive...).
 * Elsewhere: a normal file download. Nothing is sent anywhere by the app itself.
 */
export function saveBackupFile(backup: BackupFile): Promise<SaveResult> {
  return shareFile(toFile(backup));
}

export type BackupStatus =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ready'; backup: BackupFile } // file prepared, waiting for a second tap
  | { kind: 'done'; result: 'shared' | 'downloaded' }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

/** "Zrób kopię" button logic shared by the backup page and the Start banner. */
export function useMakeBackup() {
  const [status, setStatus] = useState<BackupStatus>({ kind: 'idle' });

  const save = async (backup: BackupFile) => {
    try {
      const result = await saveBackupFile(backup);
      if (result === 'needs-tap') return setStatus({ kind: 'ready', backup });
      if (result === 'cancelled') return setStatus({ kind: 'cancelled' });
      await markBackupDone(backup.exportedAt);
      setStatus({ kind: 'done', result });
    } catch (e) {
      setStatus({ kind: 'error', message: `Nie udało się zapisać kopii: ${(e as Error).message}` });
    }
  };

  const run = async () => {
    if (status.kind === 'ready') return save(status.backup);
    setStatus({ kind: 'busy' });
    try {
      await save(await createBackup());
    } catch (e) {
      setStatus({ kind: 'error', message: `Nie udało się przygotować kopii: ${(e as Error).message}` });
    }
  };

  return { status, run };
}
