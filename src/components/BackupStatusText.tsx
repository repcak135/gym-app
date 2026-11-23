import type { BackupStatus } from '../data/backupShare';

export default function BackupStatusText({ status }: { status: BackupStatus }) {
  switch (status.kind) {
    case 'done':
      return (
        <p className="bk-ok" role="status">
          {status.result === 'shared' ? 'Kopia zapisana.' : 'Kopia pobrana do folderu Pobrane.'}
        </p>
      );
    case 'ready':
      return <p className="bk-hint" role="status">Plik gotowy — stuknij „Zapisz plik”, żeby wybrać, gdzie go zapisać.</p>;
    case 'cancelled':
      return <p className="bk-hint" role="status">Nie zapisano kopii (anulowano).</p>;
    case 'error':
      return <p className="imp-error" role="alert">{status.message}</p>;
    default:
      return null;
  }
}
