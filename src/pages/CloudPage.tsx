import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CloudDownload, CloudUpload } from 'lucide-react';
import { db } from '../data/db';
import { currentSummary, summarizeBackup, type BackupFile } from '../data/backup';
import { updateSettings } from '../data/settings';
import { cloudErrorText, disableCloud, downloadLatest, enableCloud, newerLocalWorkouts, restoreFromCloud, uploadNow } from '../cloud/cloud';
import { daysAgo, formatBackupDate } from './backupFormat';
import './PlansPage.css';
import './SettingsPage.css';
import '../components/Sheet.css';
import './RankingPage.css';

type Counts = { workouts: number; sets: number; measurements: number; plans: number };

export function cloudStatusText(at: number | undefined, now = Date.now()): string {
  if (!at) return 'Ostatnia kopia w chmurze: jeszcze nie wysłana';
  const d = new Date(at);
  const time = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  return `Ostatnia kopia w chmurze: ${daysAgo(at, now)} ${time}`;
}

/** Ustawienia › Kopia w chmurze: switch on (password), status, send now, restore, switch off. */
export default function CloudPage() {
  const s = useLiveQuery(async () => (await db.settings.get('app')) ?? null, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (f: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await f();
      if (done) setInfo(done);
    } catch (e) {
      setError(cloudErrorText(e));
    }
    setBusy(false);
  };

  if (s === undefined) return null;
  return (
    <article className="rank">
      <Link to="/ustawienia" className="plan-back" aria-label="Wróć do ustawień">
        <ArrowLeft size={18} aria-hidden="true" />
        Ustawienia
      </Link>
      <h1>Kopia w chmurze</h1>
      {!s?.rankToken ? (
        <p className="rank-intro">
          Kopia w chmurze działa z kontem z Rankingu. Najpierw dołącz albo zaloguj się w <Link to="/statystyki/ranking">Statystyki › Ranking znajomych</Link>.
        </p>
      ) : !s.cloudOn ? (
        <EnableForm busy={busy} run={run} />
      ) : (
        <>
          <p className="rank-intro" role="status">
            {cloudStatusText(s.cloudLastAt)}
          </p>
          <p className="settings-group__hint">Nowa kopia wysyła się sama po treningu (najwyżej raz na 10 minut). W chmurze są 3 ostatnie kopie, zaszyfrowane Twoim hasłem.</p>
          <button type="button" className="plan-btn plan-btn--block bk-btn" disabled={busy} onClick={() => void run(uploadNow, 'Kopia wysłana.')}>
            <CloudUpload size={20} aria-hidden="true" /> Wyślij kopię teraz
          </button>
          <RestoreFromCloud busy={busy} setBusy={setBusy} setError={setError} setInfo={setInfo} />
          <label className="settings-row settings-toggle rank-toggle">
            <span className="settings-row__label">Udostępnij anonimowo listę ćwiczeń</span>
            <input type="checkbox" role="switch" checked={!!s.cloudShareStats} onChange={(e) => void updateSettings({ cloudShareStats: e.target.checked })} />
          </label>
          <p className="settings-group__hint">Tylko nazwy ćwiczeń z katalogu i liczba serii — bez nicku, dat i ciężarów. Pomaga wybrać kolejne ćwiczenia do rankingu.</p>
          <DisableCloud busy={busy} run={run} />
        </>
      )}
      {error && (
        <p className="name-sheet__error" role="alert">
          {error}
        </p>
      )}
      {info && <p className="settings-deleted">{info}</p>}
    </article>
  );
}

function EnableForm({ busy, run }: { busy: boolean; run: (f: () => Promise<unknown>, done?: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [share, setShare] = useState(true);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => enableCloud(password, share), 'Kopia w chmurze włączona. Pierwsza kopia wysłana.');
  };
  return (
    <form className="rank-form" onSubmit={submit}>
      <p className="rank-intro">
        Kopia jest zaszyfrowana Twoim hasłem. Właściciel aplikacji może ją odzyskać, jeśli zgubisz hasło. Wysyła się sama po treningu, a na nowym
        telefonie wystarczy zalogować się i przywrócić.
      </p>
      <label className="name-sheet__label">
        Twoje hasło do konta
        <input className="name-sheet__input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </label>
      <label className="rank-choice">
        <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Udostępnij anonimowo listę ćwiczeń
      </label>
      <p className="rank-hint">Tylko nazwy ćwiczeń z katalogu i liczba serii — bez nicku, dat i ciężarów. Można to wyłączyć później.</p>
      <button type="submit" className="confirm-sheet__btn confirm-sheet__btn--primary rank-submit" disabled={busy || password.length === 0}>
        {busy ? 'Chwila…' : 'Włącz kopię w chmurze'}
      </button>
    </form>
  );
}

function CountsTable({ cloud, phone }: { cloud: Counts; phone: Counts }) {
  const rows: [string, keyof Counts][] = [
    ['Treningi', 'workouts'],
    ['Serie', 'sets'],
    ['Pomiary ciała', 'measurements'],
    ['Plany', 'plans'],
  ];
  return (
    <table className="cloud-counts">
      <thead>
        <tr>
          <th />
          <th>W chmurze</th>
          <th>Na telefonie</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, k]) => (
          <tr key={k}>
            <th>{label}</th>
            <td>{cloud[k]}</td>
            <td>{phone[k]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RestoreFromCloud({
  busy,
  setBusy,
  setError,
  setInfo,
}: {
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
  setInfo: (e: string | null) => void;
}) {
  const [preview, setPreview] = useState<{ file: BackupFile; at: number; phone: Counts; newer: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const open = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { file, at } = await downloadLatest();
      const cur = await currentSummary();
      setPreview({ file, at, phone: { workouts: cur.workouts, sets: cur.sets, measurements: cur.measurements, plans: cur.plans }, newer: await newerLocalWorkouts(at) });
    } catch (e) {
      setError(cloudErrorText(e));
    }
    setBusy(false);
  };

  const confirm = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      await restoreFromCloud(preview.file);
      setPreview(null);
      setInfo('Dane przywrócone z kopii w chmurze.');
    } catch (e) {
      setError(cloudErrorText(e));
    }
    setSaving(false);
  };

  const sum = preview ? summarizeBackup(preview.file) : null;
  return (
    <>
      <button type="button" className="plan-btn plan-btn--block bk-btn" disabled={busy} onClick={() => void open()}>
        <CloudDownload size={20} aria-hidden="true" /> Przywróć kopię z chmury
      </button>
      {preview && sum && (
        <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !saving) setPreview(null); }}>
          <div role="dialog" aria-modal="true" aria-label="Kopia z chmury" className="sheet">
            <div className="sheet__handle" aria-hidden="true" />
            <div className="confirm-sheet__body">
              <p className="confirm-sheet__title">Kopia z {formatBackupDate(preview.at)}</p>
              <CountsTable cloud={{ workouts: sum.workouts, sets: sum.sets, measurements: sum.measurements, plans: sum.plans }} phone={preview.phone} />
              {preview.newer > 0 && (
                <p className="name-sheet__error" role="alert">
                  Na tym telefonie są nowsze treningi, które przepadną ({preview.newer}).
                </p>
              )}
              <p className="action-sheet__message">Dane na tym telefonie zostaną zastąpione kopią. Tego nie da się cofnąć.</p>
              <div className="confirm-sheet__actions">
                <button type="button" className="confirm-sheet__btn confirm-sheet__btn--danger" disabled={saving} onClick={() => void confirm()}>
                  {saving ? 'Przywracam…' : 'Przywróć'}
                </button>
                <button type="button" className="confirm-sheet__btn confirm-sheet__btn--cancel" disabled={saving} onClick={() => setPreview(null)}>
                  Anuluj
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DisableCloud({ busy, run }: { busy: boolean; run: (f: () => Promise<unknown>, done?: string) => Promise<void> }) {
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    if (busy) setAsk(false);
  }, [busy]);
  return ask ? (
    <div className="rank-leave" role="alertdialog" aria-label="Wyłączyć kopię w chmurze?">
      <p>Wyłączyć kopię w chmurze? Kopie zostaną usunięte z serwera. Dane w telefonie zostają.</p>
      <button type="button" className="confirm-sheet__btn confirm-sheet__btn--danger" disabled={busy} onClick={() => void run(disableCloud, 'Kopia w chmurze wyłączona i usunięta z serwera.')}>
        Tak, wyłącz i usuń
      </button>
      <button type="button" className="confirm-sheet__btn confirm-sheet__btn--cancel" onClick={() => setAsk(false)}>
        Anuluj
      </button>
    </div>
  ) : (
    <button type="button" className="settings-row settings-link settings-calc settings-danger-text" onClick={() => setAsk(true)}>
      <span className="settings-row__label">Wyłącz kopię w chmurze</span>
    </button>
  );
}

/** One status line for screens that also show the file backup status. */
export function CloudStatusLine() {
  const s = useLiveQuery(async () => (await db.settings.get('app')) ?? null, []);
  if (!s?.cloudOn) return null;
  return <p className="settings-group__hint">{cloudStatusText(s.cloudLastAt)}</p>;
}

/** After logging in on a new phone: a way to the restore while the phone has no workouts yet. */
export function CloudRestoreHint() {
  const show = useLiveQuery(async () => {
    const s = await db.settings.get('app');
    return !!s?.cloudOn && (await db.workouts.count()) === 0;
  }, []);
  if (!show) return null;
  return (
    <p className="rank-hint" role="status">
      To konto ma kopię w chmurze. <Link to="/ustawienia/chmura">Przywróć kopię z chmury</Link>
    </p>
  );
}
