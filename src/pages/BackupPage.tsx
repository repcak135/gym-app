import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Download, FileUp } from 'lucide-react';

import { getSettings } from '../data/settings';
import {
  BackupError, currentSummary, parseBackup, restoreBackup, summarizeBackup,
  type BackupFile, type BackupSummary,
} from '../data/backup';
import { useMakeBackup } from '../data/backupShare';
import { plural, workoutsLabel } from '../data/plural';
import BackupStatusText from '../components/BackupStatusText';
import { backupButtonLabel, daysAgo, formatBackupDate } from './backupFormat';
import './PlansPage.css';
import './SettingsPage.css';
import './ImportPage.css';
import './BackupPage.css';
import '../components/Sheet.css';

function Counts({ s }: { s: Omit<BackupSummary, 'exportedAt' | 'appVersion'> }) {
  return (
    <ul className="bk-counts">
      <li><span>Plany</span><b>{s.plans}</b></li>
      <li><span>Treningi</span><b>{s.workouts}</b></li>
      <li><span>Serie</span><b>{s.sets}</b></li>
      <li><span>Pomiary ciała</span><b>{s.measurements}</b></li>
      <li><span>Własne ćwiczenia</span><b>{s.customExercises}</b></li>
    </ul>
  );
}

type Restore =
  | { kind: 'none' }
  | { kind: 'preview'; file: BackupFile }
  | { kind: 'confirm'; file: BackupFile }
  | { kind: 'saving'; file: BackupFile };

export default function BackupPage() {
  const navigate = useNavigate();
  const settings = useLiveQuery(() => getSettings(), []);
  const current = useLiveQuery(() => currentSummary(), []);
  const { status, run } = useMakeBackup();
  const [restore, setRestore] = useState<Restore>({ kind: 'none' });
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setRestoreError(null);
    setRestored(false);
    try {
      setRestore({ kind: 'preview', file: parseBackup(await file.text()) });
    } catch (e) {
      setRestoreError(e instanceof BackupError ? e.message : 'Nie udało się odczytać pliku.');
    }
  };

  const doRestore = async (file: BackupFile) => {
    setRestore({ kind: 'saving', file });
    try {
      await restoreBackup(file);
      setRestore({ kind: 'none' });
      setRestored(true);
    } catch (e) {
      setRestore({ kind: 'none' });
      setRestoreError(`Nie udało się przywrócić kopii. Twoje dane zostały bez zmian. (${(e as Error).message})`);
    }
  };

  const summary = restore.kind !== 'none' ? summarizeBackup(restore.file) : null;

  return (
    <article className="bk">
      <button
        type="button"
        className="plan-back settings-back"
        aria-label="Wróć"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/ustawienia'))}
      >
        <ArrowLeft size={18} aria-hidden="true" />
        Wróć
      </button>
      <h1>Kopia zapasowa</h1>

      <section className="settings-group" aria-labelledby="bk-make">
        <h2 id="bk-make" className="settings-group__title">Zrób kopię</h2>
        <p className="settings-group__hint">
          Wszystkie Twoje dane są tylko w tym telefonie. Kopia to jeden plik z planami, treningami, seriami, pomiarami, notatkami,
          własnymi ćwiczeniami i ustawieniami. Na iPhonie wybierz „Zachowaj w Plikach” i zapisz w iCloud Drive albo na Dysku Google.
        </p>
        <p className="bk-last">
          Ostatnia kopia:{' '}
          <b>{settings?.lastBackupAt ? `${formatBackupDate(settings.lastBackupAt)} (${daysAgo(settings.lastBackupAt)})` : 'jeszcze nie było'}</b>
        </p>
        <button
          type="button"
          className="plan-btn plan-btn--primary plan-btn--block bk-btn"
          disabled={status.kind === 'busy'}
          onClick={() => void run()}
        >
          <Download size={20} aria-hidden="true" />
          {backupButtonLabel(status)}
        </button>
        <BackupStatusText status={status} />
      </section>

      <section className="settings-group" aria-labelledby="bk-restore">
        <h2 id="bk-restore" className="settings-group__title">Przywróć z kopii</h2>
        <p className="settings-group__hint">
          Wybierz plik <b>gym-kopia-…json</b>. Zanim cokolwiek się zmieni, zobaczysz, co jest w kopii.
        </p>
        <label className="plan-btn plan-btn--block imp-file bk-btn">
          <FileUp size={20} aria-hidden="true" />
          Przywróć z kopii
          {/* No `accept`: iOS greys out .json files for some MIME filters. */}
          <input
            type="file"
            aria-label="Plik kopii"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              void onFile(f);
            }}
          />
        </label>
        {restoreError && <p className="imp-error" role="alert">{restoreError}</p>}
        {restored && <p className="bk-ok" role="status">Dane przywrócone z kopii.</p>}
      </section>

      {restore.kind !== 'none' && summary && (
        <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget && restore.kind !== 'saving') setRestore({ kind: 'none' }); }}>
          <div role="dialog" aria-modal="true" aria-label="Kopia zapasowa" className="sheet">
            <div className="sheet__handle" aria-hidden="true" />
            <div className="confirm-sheet__body">
              {restore.kind === 'preview' ? (
                <>
                  <p className="confirm-sheet__title">Kopia z {formatBackupDate(summary.exportedAt)}</p>
                  <Counts s={summary} />
                  <div className="confirm-sheet__actions">
                    <button type="button" className="confirm-sheet__btn confirm-sheet__btn--primary" onClick={() => setRestore({ kind: 'confirm', file: restore.file })}>
                      Zastąp wszystko
                    </button>
                    <button type="button" className="confirm-sheet__btn confirm-sheet__btn--cancel" onClick={() => setRestore({ kind: 'none' })}>
                      Anuluj
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="confirm-sheet__title">Na pewno zastąpić wszystkie dane?</p>
                  <p className="action-sheet__message">
                    Obecne dane w telefonie ({workoutsLabel(current?.workouts ?? 0)},{' '}
                    {`${current?.plans ?? 0} ${plural(current?.plans ?? 0, 'plan', 'plany', 'planów')}`}, {`${current?.measurements ?? 0} ${plural(current?.measurements ?? 0, 'pomiar', 'pomiary', 'pomiarów')}`})
                    zostaną usunięte i zastąpione kopią z {formatBackupDate(summary.exportedAt)}. Tego nie da się cofnąć.
                  </p>
                  <div className="confirm-sheet__actions">
                    <button
                      type="button"
                      className="confirm-sheet__btn confirm-sheet__btn--danger"
                      disabled={restore.kind === 'saving'}
                      onClick={() => void doRestore(restore.file)}
                    >
                      {restore.kind === 'saving' ? 'Przywracam…' : 'Tak, zastąp moje dane'}
                    </button>
                    <button
                      type="button"
                      className="confirm-sheet__btn confirm-sheet__btn--cancel"
                      disabled={restore.kind === 'saving'}
                      onClick={() => setRestore({ kind: 'none' })}
                    >
                      Anuluj
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
