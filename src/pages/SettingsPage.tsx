import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Calculator, ChevronRight, Smartphone, Sparkles, X } from 'lucide-react';
import PlateCalculatorSheet from '../components/PlateCalculatorSheet';
import WhatsNewSheet from '../components/WhatsNewSheet';
import InstallGuideSheet from '../components/InstallGuide';
import { CHANGELOG } from '../data/changelog';
import { APP_VERSION } from '../version';
import { toggleSpike } from '../push/spike';
import { REST_SOUND_PRESETS, presetHasSound, previewSound, setBreakSilent, setSoundWanted } from '../audio/beep';
import { isAndroid, isIOS } from '../audio/backgroundRest';
import { parseWeight } from '../data/progression';

import { getSettings, updateSettings, WEIGHT_STEP_OPTIONS, BAR_WEIGHT_OPTIONS } from '../data/settings';
import { REST_OPTIONS, formatRest } from '../data/plans';
import { clampGoal } from '../data/motivation';
import { EFFORT_OPTIONS } from '../data/setTargets';
import type { AfterExerciseDone, AppSettings } from '../data/types';
import DeleteDataSheet, { type DeleteMode } from '../components/DeleteDataSheet';
import { countUserData, deleteAllUserData, deleteImportedHistory, type UserDataCounts } from '../data/wipe';
import { setsLabel, workoutsLabel } from '../data/plural';
import { THEMES, getTheme, setTheme, type ThemeId } from '../theme/themes';
import './PlansPage.css';
import './SettingsPage.css';

const kg = (n: number) => `${String(n).replace('.', ',')} kg`;
const spikeTaps = { current: 0, last: 0 };
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
  useEffect(() => {
    if (settings) {
      setBreakSilent(!!settings.restSoundBreaksSilent);
      setSoundWanted(presetHasSound(settings.restSoundPreset));
    }
  }, [settings]);
  const [calcOpen, setCalcOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [del, setDel] = useState<{ mode: DeleteMode; counts: UserDataCounts } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState<string | null>(null);
  const [theme, setThemeState] = useState<ThemeId>(getTheme);

  const askDelete = async (mode: DeleteMode) => {
    setDeleted(null);
    setDel({ mode, counts: await countUserData() });
  };

  const runDelete = async () => {
    if (!del) return;
    setDeleting(true);
    try {
      if (del.mode === 'imported') {
        const r = await deleteImportedHistory();
        setDeleted(`Usunięto zaimportowaną historię: ${workoutsLabel(r.workouts)}, ${setsLabel(r.sets)}.`);
      } else {
        await deleteAllUserData();
        navigate('/');
      }
    } finally {
      setDeleting(false);
      setDel(null);
    }
  };

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

      <section className="settings-group" aria-labelledby="set-effort">
        <h2 id="set-effort" className="settings-group__title">Jak ciężko trenujesz?</h2>
        <div role="radiogroup" aria-labelledby="set-effort">
          {EFFORT_OPTIONS.map((o) => (
            <label key={o.value} className="settings-row settings-radio">
              <span className="settings-row__label">
                {o.label}
                <small className="settings-row__sub">{o.hint}</small>
              </span>
              <input
                type="radio"
                name="effort-target"
                aria-label={o.label}
                checked={settings.effortTarget === o.value}
                onChange={() => void updateSettings({ effortTarget: o.value })}
              />
            </label>
          ))}
        </div>
        <p className="settings-group__hint">Jeśli oceniasz trudność serii, podpowiedź porówna ją z tym celem.</p>
      </section>

      <section className="settings-group" aria-labelledby="set-goal">
        <h2 id="set-goal" className="settings-group__title">Motywacja</h2>
        <p className="settings-group__hint">
          Tydzień (od poniedziałku do niedzieli) liczy się do serii na ekranie Start, gdy zrobisz tyle treningów.
        </p>
        <SettingRow label="Cel: treningi w tygodniu" id="s-goal">
          <select id="s-goal" value={clampGoal(settings.weeklyGoal)} onChange={save('weeklyGoal')}>
            {range(1, 7).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </SettingRow>
      </section>

      <section className="settings-group" aria-labelledby="set-rest">
        <h2 id="set-rest" className="settings-group__title">Koniec przerwy</h2>
        <p className="settings-group__hint">
          Na koniec przerwy zawsze pojawia się duży napis „Koniec przerwy!”. Dźwięk gra też przy wyciszonym iPhonie, gdy aplikacja jest otwarta. Wibracja działa tylko na Androidzie (na iPhonie przy „Tylko wibracja” zobaczysz sam napis).
        </p>
        <div role="radiogroup" aria-labelledby="set-rest">
          {REST_SOUND_PRESETS.map((o) => (
            <div key={o.value} className="settings-row settings-radio settings-sound">
              <label className="settings-sound__pick">
                <span className="settings-row__label">{o.label}</span>
                <input
                  type="radio"
                  name="rest-sound-preset"
                  aria-label={o.label}
                  checked={settings.restSoundPreset === o.value}
                  onChange={() => void updateSettings({ restSoundPreset: o.value })}
                />
              </label>
              {presetHasSound(o.value) && (
                <button
                  type="button"
                  className="settings-sound__play"
                  aria-label={`Posłuchaj: ${o.label}`}
                  onClick={() => void previewSound(o.value)}
                >
                  Posłuchaj
                </button>
              )}
            </div>
          ))}
        </div>
        <ToggleRow
          label="Odliczanie 3-2-1 (ciche tyknięcia)"
          checked={settings.restTicks}
          disabled={!presetHasSound(settings.restSoundPreset)}
          onChange={(v) => void updateSettings({ restTicks: v })}
        />
        <ToggleRow
          label="Wibracja"
          checked={settings.restVibration}
          onChange={(v) => void updateSettings({ restVibration: v })}
        />
        {isAndroid() && (
          <ToggleRow
            label="Graj w tle (eksperymentalne)"
            checked={!!settings.restBackgroundAudio}
            disabled={!presetHasSound(settings.restSoundPreset)}
            onChange={(v) => void updateSettings({ restBackgroundAudio: v })}
          />
        )}
        {isIOS() && (
          <ToggleRow
            label="Graj przy wyciszonym iPhonie"
            checked={!!settings.restSoundBreaksSilent}
            disabled={!presetHasSound(settings.restSoundPreset)}
            onChange={(v) => {
              setBreakSilent(v);
              void updateSettings({ restSoundBreaksSilent: v });
            }}
          />
        )}
        {isIOS() && (
          <p className="settings-group__hint">
            {settings.restSoundBreaksSilent
              ? 'Dźwięk zagra też z wyciszonym telefonem, ale zatrzyma muzykę z innych aplikacji (np. Spotify) — trzeba ją wznowić ręcznie.'
              : 'Muzyka z innych aplikacji gra dalej (na moment się ścisza). Gdy telefon jest wyciszony przełącznikiem, dźwięku nie będzie — koniec przerwy widać na ekranie.'}
          </p>
        )}
        <RestLockNote background={!!settings.restBackgroundAudio} />
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

      <section className="settings-group" aria-labelledby="set-theme">
        <h2 id="set-theme" className="settings-group__title">Wygląd</h2>
        <p className="settings-group__hint">Kolor przycisków i wyróżnień. Ustawienie tylko na tym telefonie.</p>
        <div role="radiogroup" aria-labelledby="set-theme">
          {THEMES.map((t) => (
            <label key={t.id} className="settings-row settings-radio">
              <span className="settings-row__label settings-theme">
                <span className="settings-theme__swatch" style={{ background: t.accent }} aria-hidden="true" />
                {t.label}
              </span>
              <input
                type="radio"
                name="theme"
                aria-label={t.label}
                checked={theme === t.id}
                onChange={() => {
                  setTheme(t.id);
                  setThemeState(t.id);
                }}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="settings-group" aria-labelledby="set-adv">
        <h2 id="set-adv" className="settings-group__title">Zaawansowane</h2>
        <p className="settings-group__hint">
          Ocena trudności: przy każdej serii pojawi się przycisk „Trudność” z listą RPE (ile powtórzeń zostało jeszcze w zapasie). Pole jest opcjonalne.
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
      {installOpen && <InstallGuideSheet onClose={() => setInstallOpen(false)} />}
      {newsOpen && <WhatsNewSheet title="Co nowego" entries={CHANGELOG} showVersions onClose={() => setNewsOpen(false)} />}

      <section className="settings-group" aria-labelledby="set-about">
        <h2 id="set-about" className="settings-group__title">O aplikacji</h2>
        <button type="button" className="settings-row settings-link settings-calc" onClick={() => setInstallOpen(true)}>
          <span className="settings-row__label">
            <Smartphone size={18} aria-hidden="true" /> Jak zainstalować na telefonie
          </span>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
        <div
          className="settings-row"
          onClick={() => {
            // TEMPORARY push spike: 5 quick taps toggle it.
            const now = Date.now();
            spikeTaps.current = now - spikeTaps.last < 800 ? spikeTaps.current + 1 : 1;
            spikeTaps.last = now;
            if (spikeTaps.current >= 5) {
              spikeTaps.current = 0;
              window.alert(toggleSpike() ? 'Test powiadomień: WŁĄCZONY' : 'Test powiadomień: wyłączony');
            }
          }}
        >
          <span className="settings-row__label">Wersja</span>
          <span className="settings-version">{APP_VERSION}</span>
        </div>
        <button type="button" className="settings-row settings-link settings-calc" onClick={() => setNewsOpen(true)}>
          <span className="settings-row__label">
            <Sparkles size={18} aria-hidden="true" /> Co nowego
          </span>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
        <p className="settings-group__hint settings-about">
          Licencja GNU AGPL v3.0 —{' '}
          <a href="https://github.com/repcak135/gym-app" target="_blank" rel="noreferrer">kod źródłowy</a>.
          Ćwiczenia: <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noreferrer">free-exercise-db</a>{' '}
          (ze zdjęciami) i opisy z katalogu{' '}
          <a href="https://github.com/DuarteSantos8/openGym" target="_blank" rel="noreferrer">openGym</a> (AGPL v3.0, bez zdjęć).
        </p>
      </section>

      <section className="settings-group settings-group--danger" aria-labelledby="set-danger">
        <h2 id="set-danger" className="settings-group__title">Usuń dane</h2>
        <p className="settings-group__hint">Tego nie da się cofnąć. Najpierw zrób kopię zapasową.</p>
        {deleted && <p className="settings-deleted" role="status">{deleted}</p>}
        <button type="button" className="settings-danger" onClick={() => void askDelete('imported')}>
          Usuń zaimportowaną historię
        </button>
        <button type="button" className="settings-danger" onClick={() => void askDelete('all')}>
          Usuń wszystkie dane
        </button>
      </section>
      {del && (
        <DeleteDataSheet
          mode={del.mode}
          counts={del.counts}
          busy={deleting}
          onConfirm={() => void runDelete()}
          onCancel={() => setDel(null)}
        />
      )}
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

/** Why the end sound may be late with the screen off: different on Android and iPhone. */
function RestLockNote({ background }: { background: boolean }) {
  if (isAndroid()) {
    return (
      <p className="settings-group__hint settings-rest-lock">
        {background
          ? 'Graj w tle: przerwa gra jako cichy plik audio z dźwiękiem na końcu, więc zagra też przy wygaszonym ekranie. Zużywa więcej baterii i może zatrzymać muzykę z innych aplikacji (np. Spotify); wibracja przy wygaszonym ekranie nie działa.'
          : 'Wygaszony ekran: Android usypia aplikację, więc dźwięk może zagrać dopiero po powrocie do niej. Na treningu aplikacja sama nie wygasza ekranu — nie wyłączaj go przyciskiem albo włącz „Graj w tle”.'}
      </p>
    );
  }
  if (isIOS()) {
    return (
      <p className="settings-group__hint settings-rest-lock">
        Zablokowany telefon: iPhone usypia aplikację i dźwięk zagra dopiero po powrocie do niej. Na treningu aplikacja sama nie wygasza ekranu — nie blokuj go przyciskiem.
      </p>
    );
  }
  return null;
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
