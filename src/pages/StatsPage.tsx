import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import {
  computeStats,
  daysSinceTrained,
  loadStatsInput,
  periodRange,
  weeklyCounts,
  type Period,
} from '../data/stats';
import { isFinished } from '../data/workouts';
import { MUSCLE_GROUPS } from '../data/muscleMap';
import DonutChart from '../components/stats/DonutChart';
import WeekBars from '../components/stats/WeekBars';
import BodyMap from '../components/stats/BodyMap';
import Segmented from '../components/stats/Segmented';
import BodyStats from './BodyStats';
import { setsLabel } from './historyFormat';
import './StatsPage.css';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'Tydzień' },
  { key: 'month', label: 'Miesiąc' },
  { key: 'year', label: 'Rok' },
  { key: 'all', label: 'Wszystko' },
];

// Coming back to the tab keeps the period you were looking at.
let lastView: { period: Period; offset: number } = { period: 'month', offset: 0 };
let lastTab: 'training' | 'body' = 'training';

function formatDuration(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-tile" role="group" aria-label={label}>
      <span className="stat-tile__label">{label}</span>
      <span className="stat-tile__value">{value}</span>
      {sub && <span className="stat-tile__sub">{sub}</span>}
    </div>
  );
}

export default function StatsPage() {
  const [tab, setTab] = useState(lastTab);
  useEffect(() => {
    lastTab = tab;
  }, [tab]);
  return (
    <article className="stats">
      <h1>Statystyki</h1>
      <Segmented
        label="Statystyki"
        options={[
          { key: 'training', label: 'Treningi' },
          { key: 'body', label: 'Ciało' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="stats-tab">{tab === 'training' ? <TrainingStats /> : <BodyStats />}</div>
    </article>
  );
}

function TrainingStats() {
  const input = useLiveQuery(() => loadStatsInput(), []);
  const [now] = useState(() => Date.now());
  const [view, setView] = useState(lastView);
  const [muscleMode, setMuscleMode] = useState<'primary' | 'secondary'>('primary');
  const [bodyMode, setBodyMode] = useState<'sets' | 'days'>('sets');
  const [selGroup, setSelGroup] = useState<string | null>(null);
  useEffect(() => {
    lastView = view;
  }, [view]);

  const firstAt = useMemo(() => {
    if (!input) return undefined;
    let min: number | undefined;
    for (const w of input.workouts) if (isFinished(w) && (min === undefined || w.startedAt < min)) min = w.startedAt;
    return min;
  }, [input]);

  const range = periodRange(view.period, view.offset, now, firstAt);
  const stats = useMemo(() => (input ? computeStats(input, range) : null), [input, range.start, range.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const weeks = useMemo(
    () => (input ? weeklyCounts(input, range, view.period) : []),
    [input, range.start, range.end, view.period], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const days = useMemo(() => (input ? daysSinceTrained(input, now) : {}), [input, now]);

  // Earliest period worth stepping back to: the one holding the first workout.
  const canGoBack = view.period !== 'all' && firstAt !== undefined && range.start > firstAt;

  function setPeriod(period: Period) {
    setView({ period, offset: 0 });
    setSelGroup(null);
  }
  function step(delta: number) {
    setView((v) => ({ ...v, offset: Math.min(0, v.offset + delta) }));
    setSelGroup(null);
  }

  const byGroup = stats ? stats.byGroup[muscleMode] : null;
  const slices = MUSCLE_GROUPS.map((g) => ({ ...g, value: byGroup?.[g.key] ?? 0 }));
  const groupTotal = slices.reduce((a, s) => a + s.value, 0);
  const selSlice = slices.find((s) => s.key === selGroup);

  return (
    <>
      <Segmented label="Okres" options={PERIODS} value={view.period} onChange={setPeriod} />

      <div className="stats-period">
        {view.period !== 'all' ? (
          <button
            type="button"
            className="icon-btn"
            aria-label="Poprzedni okres"
            disabled={!canGoBack}
            onClick={() => step(-1)}
          >
            <ChevronLeft size={22} />
          </button>
        ) : (
          <span className="stats-period__spacer" />
        )}
        <h2 className="stats-period__label">{range.label}</h2>
        {view.period !== 'all' ? (
          <button
            type="button"
            className="icon-btn"
            aria-label="Następny okres"
            disabled={view.offset >= 0}
            onClick={() => step(1)}
          >
            <ChevronRight size={22} />
          </button>
        ) : (
          <span className="stats-period__spacer" />
        )}
      </div>

      {!stats ? (
        <p className="stats-muted">Wczytywanie…</p>
      ) : (
        <>
          <div className="stat-tiles">
            <Tile label="Treningi" value={String(stats.workouts)} />
            <Tile
              label="Łączny czas"
              value={stats.timedWorkouts > 0 ? formatDuration(stats.totalSec) : '—'}
            />
            <Tile label="Średni czas" value={stats.avgSec !== undefined ? formatDuration(stats.avgSec) : '—'} />
            <Tile label="Serie robocze" value={String(stats.workingSets)} sub="bez rozgrzewek" />
          </div>

          {stats.workouts === 0 ? (
            <p className="stats-muted stats-empty">Brak treningów w tym okresie</p>
          ) : (
            <>
              <section className="stats-card" aria-labelledby="st-muscles">
                <div className="stats-card__head">
                  <h2 id="st-muscles">Serie na mięsień</h2>
                </div>
                <Segmented
                  label="Rodzaj mięśni"
                  options={[
                    { key: 'primary', label: 'Mięśnie główne' },
                    { key: 'secondary', label: 'Pomocnicze' },
                  ]}
                  value={muscleMode}
                  onChange={(m) => {
                    setMuscleMode(m);
                    setSelGroup(null);
                  }}
                />
                {groupTotal === 0 ? (
                  <p className="stats-muted">Brak serii z przypisanymi mięśniami {muscleMode === 'secondary' ? 'pomocniczymi' : ''}</p>
                ) : (
                  <div className="muscles">
                    <DonutChart
                      slices={slices}
                      centerValue={String(selSlice ? selSlice.value : groupTotal)}
                      centerLabel={selSlice ? selSlice.label : 'serii'}
                      selected={selGroup}
                      onSelect={setSelGroup}
                    />
                    <ul className="legend" aria-label="Serie na mięsień">
                      {slices
                        .filter((s) => s.value > 0)
                        .map((s) => (
                          <li key={s.key}>
                            <button
                              type="button"
                              className={selGroup === s.key ? 'legend__row legend__row--sel' : 'legend__row'}
                              onClick={() => setSelGroup(selGroup === s.key ? null : s.key)}
                            >
                              <span className="legend__dot" style={{ background: s.color }} />
                              <span className="legend__name">{s.label}</span>
                              <span className="legend__val">{s.value}</span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
                {stats.unmappedSets > 0 && (
                  <p className="stats-note">
                    {setsLabel(stats.unmappedSets)} bez przypisanych mięśni (własne ćwiczenia — uzupełnisz je w karcie
                    ćwiczenia)
                  </p>
                )}
                <p className="stats-note">
                  {muscleMode === 'primary'
                    ? 'Seria liczy się raz dla każdej grupy głównych mięśni ćwiczenia.'
                    : 'Seria liczy się raz dla każdej grupy mięśni pomocniczych ćwiczenia.'}
                </p>
              </section>

              <section className="stats-card" aria-labelledby="st-body">
                <div className="stats-card__head">
                  <h2 id="st-body">Sylwetka</h2>
                </div>
                <Segmented
                  label="Tryb sylwetki"
                  options={[
                    { key: 'sets', label: 'Serie w okresie' },
                    { key: 'days', label: 'Dawno nietrenowane' },
                  ]}
                  value={bodyMode}
                  onChange={setBodyMode}
                />
                <BodyMap values={bodyMode === 'sets' ? stats.byBody : days} mode={bodyMode} />
                <p className="stats-note">
                  {bodyMode === 'sets'
                    ? 'Mięśnie główne liczą się całą serią, pomocnicze połową.'
                    : 'Dni od ostatniej serii roboczej na dany mięsień (główny), niezależnie od okresu.'}
                </p>
              </section>
            </>
          )}

          {weeks.length > 0 && (firstAt !== undefined) && (
            <section className="stats-card" aria-labelledby="st-weeks">
              <div className="stats-card__head">
                <h2 id="st-weeks">Treningi w tygodniu</h2>
              </div>
              <WeekBars weeks={weeks} />
            </section>
          )}
        </>
      )}
    </>
  );
}
