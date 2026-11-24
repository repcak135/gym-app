import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Calculator, ChevronRight, X } from 'lucide-react';
import PlateCalculatorSheet from '../components/PlateCalculatorSheet';
import { parseWeight } from '../data/progression';

import { getSettings, updateSettings, WEIGHT_STEP_OPTIONS, BAR_WEIGHT_OPTIONS } from '../data/settings';
import { REST_OPTIONS, formatRest } from '../data/plans';
import type { AfterExerciseDone, AppSettings } from '../data/types';
import './PlansPage.css';
import './SettingsPage.css';

const kg = (n: number) => `${String(n).replace('.', ',')} kg`;
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const AFTER_OPTIONS: [AfterExerciseDone, string][] = [
  ['next', 'Przejdź do następnego ćwiczenia'],
  ['list', 'Pokaż listę ćwiczeń'],
  ['stay', 'Zostań na ćwiczeniu'],
];

type NumKey = Exclude<{
  [K in keyof AppSettings]: AppSettings[K] extends number ? K : never;
}[keyof AppSettings], undefined>;

export default function SettingsPage() {
  const navigate = useNavigate();
  const settings = useLiveQuery(() => getSettings(), []);
  const [calcOpen, setCalcOpen] = useState(false);

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

      <section className="settings-group" aria-labelledby="set-after">
        <h2 id="set-after" className="settings-group__title">Po ukończeniu ćwiczenia</h2>
        <p className="settings-group__hint">Co robi trening po zaliczeniu ostatniej serii ćwiczenia. Przerwa liczy się dalej.</p>
        <div role="radiogroup" aria-labelledby="set-after">
          {AFTER_OPTIONS.map(([value, label]) => (
            <label key={value} className="settings-row settings-radio">
              <span className="settings-row__label">{label}</span>
              <input
                type="radio"
                name="after-exercise-done"
                checked={settings.afterExerciseDone === value}
                onChange={() => void updateSettings({ afterExerciseDone: value })}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="settings-group" aria-labelledby="set-adv">
        <h2 id="set-adv" className="settings-group__title">Zaawansowane</h2>
        <p className="settings-group__hint">
          Ocena trudności: przy każdej serii pojawi się przycisk „Trudność” z listą RPE (ile powtórzeń jeszcze dałbyś radę zrobić). Pole jest opcjonalne.
        </p>
        <ToggleRow
          label="Ocena trudności serii (RPE/RIR)"
          checked={settings.showRir}
          onChange={(v) => void updateSettings({ showRir: v })}
        />
        <ToggleRow
          label="Pytaj o trudność po zaliczeniu serii"
          checked={settings.showRir && settings.askDifficultyAfterSet}
          disabled={!settings.showRir}
          onChange={(v) => void updateSettings({ askDifficultyAfterSet: v })}
        />
      </section>

      <section className="settings-group" aria-labelledby="set-data">
        <h2 id="set-data" className="settings-group__title">Dane</h2>
        <Link to="/ustawienia/kopia" className="settings-row settings-link">
          <span className="settings-row__label">Kopia zapasowa</span>
          <ChevronRight size={20} aria-hidden="true" />
        </Link>
        <Link to="/ustawienia/import" className="settings-row settings-link">
          <span className="settings-row__label">Importuj historię</span>
          <ChevronRight size={20} aria-hidden="true" />
        </Link>
        <Link to="/ustawienia/plan-z-historii" className="settings-row settings-link">
          <span className="settings-row__label">Odtwórz plan z historii</span>
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
        <PlatesRow plates={settings.plates} />
        <button type="button" className="settings-row settings-link settings-calc" onClick={() => setCalcOpen(true)}>
          <span className="settings-row__label">
            <Calculator size={18} aria-hidden="true" /> Kalkulator talerzy
          </span>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </section>
      {calcOpen && <PlateCalculatorSheet onClose={() => setCalcOpen(false)} />}

      <section className="settings-group" aria-labelledby="set-about">
        <h2 id="set-about" className="settings-group__title">O aplikacji</h2>
        <p className="settings-group__hint settings-about">
          Licencja GNU AGPL v3.0 —{' '}
          <a href="https://github.com/repcak135/gym-app" target="_blank" rel="noreferrer">kod źródłowy</a>.
          Ćwiczenia: <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noreferrer">free-exercise-db</a>{' '}
          (ze zdjęciami) i opisy z katalogu{' '}
          <a href="https://github.com/DuarteSantos8/openGym" target="_blank" rel="noreferrer">openGym</a> (AGPL v3.0, bez zdjęć).
        </p>
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

function ToggleRow({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="settings-row settings-toggle">
      <span className="settings-row__label">{label}</span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function PlatesRow({ plates }: { plates: number[] }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sorted = [...plates].sort((a, b) => b - a);
  const add = () => {
    const n = parseWeight(text);
    if (n === null || n <= 0 || n > 100) return setError('Wpisz ciężar talerza, np. 0,5');
    setError(null);
    setText('');
    if (!plates.includes(n)) void updateSettings({ plates: [...plates, n].sort((a, b) => b - a) });
  };
  return (
    <div className="settings-plates">
      <span className="settings-row__label">Dostępne talerze</span>
      <ul className="settings-plates__list" aria-label="Dostępne talerze">
        {sorted.map((p) => (
          <li key={p}>
            {kg(p)}
            <button
              type="button"
              aria-label={`Usuń talerz ${kg(p)}`}
              onClick={() => void updateSettings({ plates: plates.filter((x) => x !== p) })}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
        {sorted.length === 0 && <li className="settings-plates__empty">brak — sam gryf</li>}
      </ul>
      <form className="settings-plates__add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input
          inputMode="decimal"
          aria-label="Nowy talerz (kg)"
          placeholder="np. 0,5"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit">Dodaj talerz</button>
      </form>
      {error && <p className="settings-plates__error" role="alert">{error}</p>}
    </div>
  );
}
