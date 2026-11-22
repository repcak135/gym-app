import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, ChevronRight } from 'lucide-react';

import { getSettings, updateSettings, WEIGHT_STEP_OPTIONS, BAR_WEIGHT_OPTIONS } from '../data/settings';
import { REST_OPTIONS, formatRest } from '../data/plans';
import type { AppSettings } from '../data/types';
import './PlansPage.css';
import './SettingsPage.css';

const kg = (n: number) => `${String(n).replace('.', ',')} kg`;
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

type NumKey = Exclude<{
  [K in keyof AppSettings]: AppSettings[K] extends number ? K : never;
}[keyof AppSettings], undefined>;

export default function SettingsPage() {
  const navigate = useNavigate();
  const settings = useLiveQuery(() => getSettings(), []);

  if (!settings) return <article><h1>Ustawienia</h1></article>;

  const save = (key: NumKey) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    void updateSettings({ [key]: Number(e.target.value) });

  const rest = REST_OPTIONS.includes(settings.defaultRestSec)
    ? REST_OPTIONS
    : [...REST_OPTIONS, settings.defaultRestSec].sort((a, b) => a - b);

  return (
    <article>
      <button
        type="button"
        className="plan-back settings-back"
        aria-label="Wróć"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
      >
        <ArrowLeft size={18} aria-hidden="true" />
        Wróć
      </button>
      <h1>Ustawienia</h1>

      <section className="settings-group" aria-labelledby="set-new">
        <h2 id="set-new" className="settings-group__title">Nowe ćwiczenie w planie</h2>
        <p className="settings-group__hint">
          Te wartości dostaje każde nowo dodane ćwiczenie. Zmiana nie wpływa na ćwiczenia już zapisane w planach.
        </p>
        <SettingRow label="Przerwa" id="s-rest">
          <select id="s-rest" value={settings.defaultRestSec} onChange={save('defaultRestSec')}>
            {rest.map((s) => <option key={s} value={s}>{formatRest(s)}</option>)}
          </select>
        </SettingRow>
        <SettingRow label="Serie" id="s-sets">
          <select id="s-sets" value={settings.defaultSets} onChange={save('defaultSets')}>
            {range(1, 10).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </SettingRow>
        <SettingRow label="Serie rozgrzewkowe" id="s-warm">
          <select id="s-warm" value={settings.defaultWarmupSets} onChange={save('defaultWarmupSets')}>
            {range(0, 5).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </SettingRow>
        <div className="settings-row">
          <span className="settings-row__label">Powtórzenia</span>
          <span className="settings-row__range">
            <select aria-label="Powtórzenia od" value={settings.defaultRepsMin} onChange={save('defaultRepsMin')}>
              {range(1, 30).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span aria-hidden="true">–</span>
            <select aria-label="Powtórzenia do" value={settings.defaultRepsMax} onChange={save('defaultRepsMax')}>
              {range(1, 30).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </span>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="set-rest">
        <h2 id="set-rest" className="settings-group__title">Koniec przerwy</h2>
        <p className="settings-group__hint">
          Na koniec przerwy zawsze pojawia się duży napis „Koniec przerwy!”. Dźwięk gra też przy wyciszonym iPhonie, gdy aplikacja jest otwarta. Wibracja działa tylko na Androidzie.
        </p>
        <ToggleRow
          label="Dźwięk końca przerwy"
          checked={settings.restSound}
          onChange={(v) => void updateSettings({ restSound: v })}
        />
        <ToggleRow
          label="Wibracja"
          checked={settings.restVibration}
          onChange={(v) => void updateSettings({ restVibration: v })}
        />
      </section>

      <section className="settings-group" aria-labelledby="set-adv">
        <h2 id="set-adv" className="settings-group__title">Zaawansowane</h2>
        <p className="settings-group__hint">
          RIR (powtórzenia w zapasie): ile powtórzeń jeszcze dałbyś radę zrobić. Przy każdej serii pojawi się szybki wybór 0–5+. Pole jest opcjonalne.
        </p>
        <ToggleRow
          label="Pokaż RIR (zaawansowane)"
          checked={settings.showRir}
          onChange={(v) => void updateSettings({ showRir: v })}
        />
      </section>

      <section className="settings-group" aria-labelledby="set-data">
        <h2 id="set-data" className="settings-group__title">Dane</h2>
        <Link to="/ustawienia/import" className="settings-row settings-link">
          <span className="settings-row__label">Importuj historię</span>
          <ChevronRight size={20} aria-hidden="true" />
        </Link>
      </section>

      <section className="settings-group" aria-labelledby="set-weight">
        <h2 id="set-weight" className="settings-group__title">Ciężar</h2>
        <SettingRow label="Krok ciężaru" id="s-step">
          <select id="s-step" value={settings.defaultWeightStep} onChange={save('defaultWeightStep')}>
            {WEIGHT_STEP_OPTIONS.map((n) => <option key={n} value={n}>{kg(n)}</option>)}
          </select>
        </SettingRow>
        <SettingRow label="Waga gryfu" id="s-bar">
          <select id="s-bar" value={settings.barWeight} onChange={save('barWeight')}>
            {BAR_WEIGHT_OPTIONS.map((n) => <option key={n} value={n}>{kg(n)}</option>)}
          </select>
        </SettingRow>
      </section>
    </article>
  );
}

function SettingRow({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <label className="settings-row__label" htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="settings-row settings-toggle">
      <span className="settings-row__label">{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
