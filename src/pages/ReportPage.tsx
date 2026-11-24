import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';

import {
  buildReport,
  loadReportInput,
  reportFileName,
  reportRange,
  type ReportData,
  type ReportPeriod,
} from '../data/report';
import { shareFile } from '../data/shareFile';
import { isFinished } from '../data/workouts';
import { workoutsLabel } from '../data/plural';
import Segmented from '../components/stats/Segmented';
import './PlansPage.css';
import './StatsPage.css';
import './BackupPage.css';
import './ReportPage.css';

const PERIODS: { key: ReportPeriod; label: string }[] = [
  { key: 'week', label: 'Tydzień' },
  { key: 'month', label: 'Miesiąc' },
  { key: 'year', label: 'Rok' },
  { key: 'all', label: 'Od początku' },
  { key: 'custom', label: 'Własny' },
];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function plDate(s: string): string {
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ready'; file: File }
  | { kind: 'done'; result: 'shared' | 'downloaded' }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

export default function ReportPage() {
  const input = useLiveQuery(() => loadReportInput(), []);
  const [now] = useState(() => Date.now());
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [from, setFrom] = useState(() => {
    const d = new Date(now);
    return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [to, setTo] = useState(() => ymd(new Date(now)));
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const firstAt = useMemo(() => {
    if (!input) return undefined;
    let min: number | undefined;
    for (const w of input.workouts) if (isFinished(w) && (min === undefined || w.startedAt < min)) min = w.startedAt;
    return min;
  }, [input]);

  const computed = useMemo((): { data: ReportData } | { error: string } | null => {
    if (!input) return null;
    try {
      const range = reportRange(period, now, firstAt, period === 'custom' ? { from, to } : undefined);
      return { data: buildReport(input, range) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [input, period, now, firstAt, from, to]);

  const send = async (file: File) => {
    const result = await shareFile(file);
    if (result === 'needs-tap') return setStatus({ kind: 'ready', file });
    if (result === 'cancelled') return setStatus({ kind: 'cancelled' });
    setStatus({ kind: 'done', result });
  };

  const create = async () => {
    if (!computed || !('data' in computed)) return;
    if (status.kind === 'ready') return void send(status.file).catch(fail);
    setStatus({ kind: 'busy' });
    try {
      const { reportBlob } = await import('../data/reportXlsx');
      const blob = await reportBlob(computed.data);
      const file = new File([blob], reportFileName(computed.data), { type: blob.type });
      await send(file);
    } catch (e) {
      fail(e);
    }
  };

  function fail(e: unknown) {
    setStatus({ kind: 'error', message: `Nie udało się utworzyć raportu: ${(e as Error).message}` });
  }

  const changePeriod = (p: ReportPeriod) => {
    setPeriod(p);
    setStatus({ kind: 'idle' });
  };

  return (
    <article className="stats report">
      <Link to="/statystyki" className="plan-back" aria-label="Wróć do statystyk">
        <ArrowLeft size={18} aria-hidden="true" />
        Statystyki
      </Link>
      <h1>Raport dla trenera</h1>
      <p className="plan-muted">
        Plik Excel z treningami, seriami, progresem ćwiczeń i pomiarami ciała z wybranego okresu.
      </p>

      <Segmented label="Okres raportu" options={PERIODS} value={period} onChange={changePeriod} />

      {period === 'custom' && (
        <div className="report-dates">
          <label>
            Od
            <input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setStatus({ kind: 'idle' }); }} />
          </label>
          <label>
            Do
            <input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setStatus({ kind: 'idle' }); }} />
          </label>
        </div>
      )}

      {computed === null && <p className="plan-muted">Ładowanie…</p>}
      {computed && 'error' in computed && (
        <p className="report-error" role="alert">{computed.error}</p>
      )}
      {computed && 'data' in computed && (
        <div className="report-card" role="group" aria-label="Zakres raportu">
          <p className="report-card__range">
            {plDate(computed.data.from)} – {plDate(computed.data.to)}
          </p>
          <p className="plan-muted">
            {workoutsLabel(computed.data.summary.workouts)} · serie robocze: {computed.data.summary.workingSets}
            {' '}· pomiary ciała: {computed.data.body.length}
          </p>
        </div>
      )}

      <button
        type="button"
        className="plan-btn plan-btn--primary plan-btn--block report-btn"
        disabled={!computed || !('data' in computed) || status.kind === 'busy'}
        onClick={() => void create()}
      >
        <FileSpreadsheet size={18} aria-hidden="true" />
        {status.kind === 'busy'
          ? 'Tworzę raport…'
          : status.kind === 'ready'
            ? 'Raport gotowy — dotknij, aby wysłać'
            : 'Utwórz raport'}
      </button>

      {status.kind === 'done' && (
        <p className="bk-ok" role="status">
          {status.result === 'shared' ? 'Raport wysłany.' : 'Raport pobrany — znajdziesz go w Pobranych plikach.'}
        </p>
      )}
      {status.kind === 'cancelled' && <p className="bk-hint" role="status">Anulowano wysyłanie.</p>}
      {status.kind === 'error' && <p className="report-error" role="alert">{status.message}</p>}

      <p className="bk-hint">
        Plik powstaje na telefonie. Nic nie jest wysyłane, dopóki sam go nie udostępnisz
        (Messenger, mail, WhatsApp…).
      </p>
    </article>
  );
}
