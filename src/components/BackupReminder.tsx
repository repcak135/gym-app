import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { getSettings } from '../data/settings';
import { backupReminderDue, snoozeBackupReminder } from '../data/backup';
import { useMakeBackup } from '../data/backupShare';
import BackupStatusText from './BackupStatusText';
import { backupButtonLabel, daysAgo } from '../pages/backupFormat';
import '../pages/PlansPage.css';
import '../pages/ImportPage.css';
import '../pages/BackupPage.css';

/** Start-screen banner: no backup yet or the last one is older than 14 days. */
export default function BackupReminder() {
  const { status, run } = useMakeBackup();
  const state = useLiveQuery(async () => {
    const s = await getSettings();
    const hasWorkouts = (await db.workouts.count()) > 0;
    return { s, due: backupReminderDue(s, hasWorkouts) };
  }, []);

  // Keep the banner while showing the result of a backup made from it.
  if (!state || (!state.due && status.kind !== 'done')) return null;
  const last = state.s.lastBackupAt;

  return (
    <section className="bk-banner" aria-label="Przypomnienie o kopii">
      {status.kind === 'done' ? (
        <BackupStatusText status={status} />
      ) : (
        <>
          <p className="bk-banner__title">Zrób kopię zapasową</p>
          <p className="bk-banner__text">
            {last ? `Ostatnia kopia: ${daysAgo(last)}.` : 'Nie masz jeszcze kopii.'} Dane są tylko w tym telefonie.
          </p>
          <div className="bk-banner__actions">
            <button type="button" className="plan-btn plan-btn--primary" disabled={status.kind === 'busy'} onClick={() => void run()}>
              {backupButtonLabel(status)}
            </button>
            <button type="button" className="plan-btn" onClick={() => void snoozeBackupReminder()}>
              Później
            </button>
          </div>
          <BackupStatusText status={status} />
        </>
      )}
    </section>
  );
}
