import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Plus } from 'lucide-react';

import {
  BODY_METRICS,
  entryValues,
  formatChange,
  listBodyEntries,
  metricSeries,
  metricSummary,
  overview,
} from '../data/body';
import { periodRange, type Period } from '../data/stats';
import type { BodyEntry, BodyMetric } from '../data/types';
import Segmented from '../components/stats/Segmented';
import LineChart from '../components/stats/LineChart';
import BodyEntrySheet from '../components/BodyEntrySheet';
import { MONTHS_GENITIVE } from './historyFormat';
import './BodyStats.css';
import { removeBodyEntryUndoable } from '../data/undoable';
import { showUndo } from '../undo';
import SwipeRow from '../components/SwipeRow';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'Tydzień' },
  { key: 'month', label: 'Miesiąc' },
  { key: 'year', label: 'Rok' },
  { key: 'all', label: 'Wszystko' },
];

// Coming back to the tab keeps the open metric and period.
let lastView: { metric: BodyMetric | null; period: Period; offset: number } = {
  metric: null,
  period: 'all',
  offset: 0,
};

function fmt(v: number): string {
  return (Math.round(v * 10) / 10).toString().replace('.', ',');
}

function metaOf(key: BodyMetric) {
  return BODY_METRICS.find((m) => m.key === key)!;
}

function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS_GENITIVE[m - 1]} ${y}`;
}

function valuesLabel(n: number): string {
  if (n === 1) return '1 wymiar';
  if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) return `${n} wymiary`;
  return `${n} wymiarów`;
}

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' | null }) {
  if (trend === 'up') return <ArrowUpRight size={18} aria-label="w górę" />;
  if (trend === 'down') return <ArrowDownRight size={18} aria-label="w dół" />;
  if (trend === 'flat') return <ArrowRight size={18} aria-label="bez zmian" />;
  return <span className="body-trend__none" />;
}

export default function BodyStats() {
  const entries = useLiveQuery(() => listBodyEntries(), []);
  const [now] = useState(() => Date.now());
  const [view, setView] = useState(lastView);
  const [sheet, setSheet] = useState<{ entry?: BodyEntry } | null>(null);
  useEffect(() => {
    lastView = view;
  }, [view]);

  const rows = useMemo(() => (entries ? overview(entries) : []), [entries]);

  if (!entries) return <p className="stats-muted">Wczytywanie…</p>;

  const addButton = (
    <button type="button" className="body-add" onClick={() => setSheet({})}>
      <Plus size={20} /> Dodaj pomiar
    </button>
  );
  const sheetEl = sheet && <BodyEntrySheet entry={sheet.entry} onClose={() => setSheet(null)} />;

  if (view.metric) {
    const metric = view.metric;
    const meta = metaOf(metric);
    const all = metricSeries(entries, metric);
    const firstAt = all[0]?.at;
    const range = periodRange(view.period, view.offset, now, firstAt);
    const sum = metricSummary(entries, metric, range);
    const canGoBack = view.period !== 'all' && firstAt !== undefined && range.start > firstAt;
    const withMetric = entries.filter((e) => entryValues(e)[metric] !== undefined).reverse();
    return (
      <div className="body-metric">
        <button
          type="button"
          className="body-back"
          onClick={() => setView((v) => ({ ...v, metric: null }))}
        >
          <ChevronLeft size={20} /> Wszystkie wymiary
        </button>
        <h2 className="body-metric__title">
          {meta.label} <span className="body-unit">({meta.unit})</span>
        </h2>
        <Segmented
          label="Okres"
          options={PERIODS}
          value={view.period}
          onChange={(p) => setView((v) => ({ ...v, period: p, offset: 0 }))}
        />
        <div className="stats-period">
          {view.period !== 'all' ? (
            <button
              type="button"
              className="icon-btn"
              aria-label="Poprzedni okres"
              disabled={!canGoBack}
              onClick={() => setView((v) => ({ ...v, offset: v.offset - 1 }))}
            >
              <ChevronLeft size={22} />
            </button>
          ) : (
            <span className="stats-period__spacer" />
          )}
          <h3 className="stats-period__label">{range.label}</h3>
          {view.period !== 'all' ? (
            <button
              type="button"
              className="icon-btn"
              aria-label="Następny okres"
              disabled={view.offset >= 0}
              onClick={() => setView((v) => ({ ...v, offset: Math.min(0, v.offset + 1) }))}
            >
              <ChevronRight size={22} />
            </button>
          ) : (
            <span className="stats-period__spacer" />
          )}
        </div>

        {sum.points.length === 0 ? (
          <p className="stats-muted stats-empty">Brak pomiarów w tym okresie</p>
        ) : (
          <>
            <div className="stat-tiles">
              <div className="stat-tile" role="group" aria-label="Ostatnio">
                <span className="stat-tile__label">Ostatnio</span>
                <span className="stat-tile__value">
                  {fmt(sum.latest!)} {meta.unit}
                </span>
                <span className="stat-tile__sub">{dateLabel(sum.points[sum.points.length - 1].date)}</span>
              </div>
              <div className="stat-tile" role="group" aria-label="Zmiana">
                <span className="stat-tile__label">W tym okresie</span>
                <span className="stat-tile__value">
                  {sum.changeInPeriod !== undefined ? formatChange(sum.changeInPeriod, meta.unit) : '—'}
                </span>
                <span className="stat-tile__sub">
                  {sum.changeFromStart !== undefined
                    ? `${formatChange(sum.changeFromStart, meta.unit)} od startu`
                    : 'pierwszy pomiar'}
                </span>
              </div>
            </div>
            <section className="stats-card">
              <LineChart
                points={sum.points}
                unit={meta.unit}
                start={range.start}
                end={Math.min(range.end, now)}
                label={`${meta.label} w czasie`}
              />
            </section>
          </>
        )}

        <section className="stats-card">
          <h2 className="body-h2">Pomiary</h2>
          <ul className="body-list" aria-label={`Pomiary: ${meta.label}`}>
            {withMetric.map((e) => (
              <li key={e.id}>
                <SwipeRow
                  label={`pomiar z ${dateLabel(e.date)}`}
                  onDelete={async () => {
                    const restore = await removeBodyEntryUndoable(e.id);
                    showUndo(`Usunięto pomiar z ${dateLabel(e.date)}`, restore);
                  }}
                >
                  <button type="button" className="body-row" onClick={() => setSheet({ entry: e })}>
                    <span className="body-row__name">{dateLabel(e.date)}</span>
                    <span className="body-row__val">
                      {fmt(entryValues(e)[metric]!)} {meta.unit}
                    </span>
                  </button>
                </SwipeRow>
              </li>
            ))}
          </ul>
        </section>
        {addButton}
        {sheetEl}
      </div>
    );
  }

  return (
    <div className="body-stats">
      {addButton}
      {rows.length === 0 ? (
        <p className="stats-muted body-empty">
          Wpisz wagę albo obwody (talia, biceps, udo…), a tu zobaczysz postępy i wykresy. Mierz najlepiej rano, w tych
          samych miejscach.
        </p>
      ) : (
        <>
          <section className="stats-card">
            <h2 className="body-h2">Wymiary</h2>
            <ul className="body-list" aria-label="Wymiary">
              {rows.map((r) => {
                const meta = metaOf(r.metric);
                return (
                  <li key={r.metric}>
                    <button
                      type="button"
                      className="body-row"
                      onClick={() => setView((v) => ({ ...v, metric: r.metric, offset: 0 }))}
                    >
                      <span className="body-row__name">{meta.label}</span>
                      <span className="body-row__main">
                        <span className="body-row__val">
                          {fmt(r.latest)} {meta.unit}
                        </span>
                        {r.changeFromStart !== undefined && (
                          <span className="body-row__sub">{formatChange(r.changeFromStart, meta.unit)} od startu</span>
                        )}
                      </span>
                      <span className="body-trend">
                        <TrendIcon trend={r.trend} />
                      </span>
                      <ChevronRight size={18} className="body-row__chev" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="stats-card">
            <h2 className="body-h2">Wszystkie wpisy</h2>
            <ul className="body-list" aria-label="Wszystkie wpisy">
              {[...entries].reverse().map((e) => (
                <li key={e.id}>
                  <button type="button" className="body-row" onClick={() => setSheet({ entry: e })}>
                    <span className="body-row__name">{dateLabel(e.date)}</span>
                    <span className="body-row__sub">{valuesLabel(Object.keys(entryValues(e)).length)}</span>
                    <ChevronRight size={18} className="body-row__chev" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      {sheetEl}
    </div>
  );
}
