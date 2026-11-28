import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';
import { db } from '../data/db';
import { saveBodyEntry } from '../data/body';
import type { Sex } from '../data/dots';
import type { AppSettings } from '../data/types';
import Segmented from '../components/stats/Segmented';
import DotsHelpSheet from '../ranking/DotsHelpSheet';
import { CloudRestoreHint } from './CloudPage';
import { api, ApiError, type Ranking, type Row } from '../ranking/api';
import { changePassword, errorText, joinRanking, loginRanking, MIN_PASSWORD, NICK_RE, signOutLocally } from '../ranking/account';
import { hasBodyWeight, isoWeekKey, monthKey } from '../ranking/scores';
import { syncScores } from '../ranking/RankingSync';
import './PlansPage.css';
import './StatsPage.css';
import '../components/Sheet.css';
import './RankingPage.css';

const SEEN_KEY = 'gym.rankSeen';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtPoints = (v: number) => v.toFixed(1).replace('.', ',');

/** Statystyki › Ranking: optional friends' ranking (workouts and bench DOTS points). */
export default function RankingPage() {
  const settings = useLiveQuery(async () => (await db.settings.get('app')) ?? null, []);
  const [mustChange, setMustChange] = useState(false);
  const askNewPassword = useCallback(() => setMustChange(true), []);
  if (settings === undefined) return null;
  return (
    <article className="rank">
      <Link to="/statystyki" className="plan-back" aria-label="Wróć do statystyk">
        <ArrowLeft size={18} aria-hidden="true" />
        Statystyki
      </Link>
      <h1>Ranking</h1>
      {!settings?.rankToken ? (
        <JoinOrLogin settings={settings} onMustChange={askNewPassword} />
      ) : mustChange ? (
        <NewPassword token={settings.rankToken} onDone={() => setMustChange(false)} forced />
      ) : (
        <Tables settings={settings} onMustChange={askNewPassword} />
      )}
    </article>
  );
}

function SexPick({ value, onChange }: { value: Sex | undefined; onChange: (s: Sex) => void }) {
  return (
    <fieldset className="rank-fieldset">
      <legend>Płeć (do punktów DOTS, zostaje w telefonie)</legend>
      <label className="rank-choice">
        <input type="radio" name="rank-sex" checked={value === 'm'} onChange={() => onChange('m')} /> Mężczyzna
      </label>
      <label className="rank-choice">
        <input type="radio" name="rank-sex" checked={value === 'f'} onChange={() => onChange('f')} /> Kobieta
      </label>
    </fieldset>
  );
}

function JoinOrLogin({ settings, onMustChange }: { settings: AppSettings | null; onMustChange: () => void }) {
  const [mode, setMode] = useState<'join' | 'login'>('join');
  const [nick, setNick] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [sex, setSex] = useState<Sex | undefined>(settings?.rankSex);
  const [shareWorkouts, setShareWorkouts] = useState(true);
  const [shareBench, setShareBench] = useState(true);
  const [weight, setWeight] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = useLiveQuery(() => db.body.toArray(), []);
  const needsWeight = mode === 'join' && shareBench && body !== undefined && !hasBodyWeight(body);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = nick.normalize('NFC').trim();
    if (!NICK_RE.test(n)) return setError('Nick: 3–20 znaków — litery (także polskie), cyfry, _ albo -.');
    if (password.length < MIN_PASSWORD) return setError(`Hasło musi mieć co najmniej ${MIN_PASSWORD} znaków.`);
    if (mode === 'join' && password !== password2) return setError('Hasła się różnią.');
    if (!sex) return setError('Wybierz płeć.');
    if (mode === 'join' && !shareWorkouts && !shareBench) return setError('Wybierz, co chcesz pokazywać w rankingu.');
    const kg = Number(weight.replace(',', '.'));
    if (needsWeight && !(kg >= 30 && kg <= 300)) return setError('Wpisz aktualną wagę ciała (kg).');
    setBusy(true);
    try {
      if (mode === 'join') {
        await joinRanking({ nick: n, password, sex, shareWorkouts, shareBench });
        if (needsWeight) await saveBodyEntry({ date: today(), values: { weight: kg } });
      } else if (await loginRanking({ nick: n, password, sex })) onMustChange();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };

  return (
    <form className="rank-form" onSubmit={(e) => void submit(e)}>
      <p className="rank-intro">
        Ranking jest dobrowolny. Na serwer trafia tylko nick, liczba treningów w tygodniu i miesiącu oraz punkty z wyciskania na ławce —
        bez wagi ciała, kilogramów i historii. Hasło nie opuszcza telefonu.
      </p>
      <Segmented
        label="Konto"
        options={[
          { key: 'join', label: 'Dołącz' },
          { key: 'login', label: 'Mam już konto' },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
      />
      <label className="name-sheet__label">
        Nick
        <input className="name-sheet__input" value={nick} onChange={(e) => setNick(e.target.value)} autoComplete="username" maxLength={20} />
      </label>
      <label className="name-sheet__label">
        Hasło (min. {MIN_PASSWORD} znaków)
        <input
          className="name-sheet__input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'join' ? 'new-password' : 'current-password'}
        />
      </label>
      {mode === 'join' && (
        <label className="name-sheet__label">
          Powtórz hasło
          <input className="name-sheet__input" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
        </label>
      )}
      <SexPick value={sex} onChange={setSex} />
      {mode === 'join' && (
        <fieldset className="rank-fieldset">
          <legend>Co pokazywać innym</legend>
          <label className="rank-choice">
            <input type="checkbox" checked={shareWorkouts} onChange={(e) => setShareWorkouts(e.target.checked)} /> Liczba treningów (tydzień i miesiąc)
          </label>
          <label className="rank-choice">
            <input type="checkbox" checked={shareBench} onChange={(e) => setShareBench(e.target.checked)} /> Punkty z wyciskania na ławce (DOTS)
          </label>
        </fieldset>
      )}
      {needsWeight && (
        <label className="name-sheet__label">
          Twoja aktualna waga ciała (kg) — do punktów, zapisze się w Ciało i nie trafi na serwer
          <input className="name-sheet__input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
      )}
      {error && (
        <p className="name-sheet__error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="confirm-sheet__btn confirm-sheet__btn--primary rank-submit" disabled={busy}>
        {busy ? 'Chwila…' : mode === 'join' ? 'Dołącz do rankingu' : 'Zaloguj'}
      </button>
      {mode === 'login' && <p className="rank-hint">Nie pamiętasz hasła? Poproś autora aplikacji o hasło tymczasowe.</p>}
    </form>
  );
}

export function NewPassword({ token, onDone, forced }: { token: string; onDone: () => void; forced?: boolean }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (p1.length < MIN_PASSWORD) return setError(`Hasło musi mieć co najmniej ${MIN_PASSWORD} znaków.`);
    if (p1 !== p2) return setError('Hasła się różnią.');
    setBusy(true);
    setError(null);
    try {
      await changePassword(token, p1);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) await signOutLocally();
      setError(errorText(err));
    }
    setBusy(false);
  };
  return (
    <form className="rank-form" onSubmit={(e) => void submit(e)} aria-label="Nowe hasło">
      {forced && <p className="rank-intro">Zalogowano hasłem tymczasowym. Ustaw teraz własne hasło.</p>}
      <label className="name-sheet__label">
        Nowe hasło (min. {MIN_PASSWORD} znaków)
        <input className="name-sheet__input" type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" />
      </label>
      <label className="name-sheet__label">
        Powtórz nowe hasło
        <input className="name-sheet__input" type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" />
      </label>
      {error && (
        <p className="name-sheet__error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="confirm-sheet__btn confirm-sheet__btn--primary rank-submit" disabled={busy}>
        {busy ? 'Chwila…' : 'Zapisz nowe hasło'}
      </button>
    </form>
  );
}

type Seen = Record<string, number>;
function readSeen(): Seen {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Seen;
  } catch {
    return {};
  }
}

function Tables({ settings, onMustChange }: { settings: AppSettings; onMustChange: () => void }) {
  const token = settings.rankToken!;
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [data, setData] = useState<Ranking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seen] = useState(readSeen);
  const body = useLiveQuery(() => db.body.toArray(), []);
  const now = Date.now();
  const keys = { week: isoWeekKey(now), month: monthKey(now) };

  const load = useCallback(async () => {
    setError(null);
    try {
      const me = await api.me(token);
      if (me.mustChange) return onMustChange();
      await syncScores(); // own row up to date before showing the table
      setData(await api.ranking(token, isoWeekKey(Date.now()), monthKey(Date.now())));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) await signOutLocally();
      else setError(errorText(err));
    }
  }, [token, onMustChange]);

  useEffect(() => {
    void load();
  }, [load]);

  // Remember the places seen now, for "↑ x" next time.
  useEffect(() => {
    if (!data) return;
    const next: Seen = { ...readSeen() };
    for (const p of ['week', 'month'] as const) {
      const i = data[p].workouts.findIndex((r) => r.nick === data.me);
      if (i >= 0) next[`${keys[p]}:workouts`] = i + 1;
    }
    const b = data.bench.findIndex((r) => r.nick === data.me);
    if (b >= 0) next['all:bench'] = b + 1;
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(next));
    } catch {
      // private mode
    }
  }, [data, keys.week, keys.month]);

  const benchNeedsWeight = settings.rankShareBench && body !== undefined && !hasBodyWeight(body);
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <div className="rank-tables">
      {error && (
        <p className="name-sheet__error" role="alert">
          {error}
        </p>
      )}
      <CloudRestoreHint />
      {!data && !error && <p className="rank-hint">Wczytywanie…</p>}
      {data && (
        <>
          <Table
            title="Treningi"
            rows={data[period].workouts}
            me={data.me}
            prev={seen[`${keys[period]}:workouts`]}
            format={(v) => String(v)}
            head={
              <Segmented
                label="Okres"
                options={[
                  { key: 'week', label: 'Tydzień' },
                  { key: 'month', label: 'Miesiąc' },
                ]}
                value={period}
                onChange={setPeriod}
              />
            }
          />
          <Table
            title="Ławka (DOTS) · rekord wszech czasów"
            rows={data.bench}
            me={data.me}
            prev={seen['all:bench']}
            format={fmtPoints}
            info={
              <button type="button" className="rank-info" aria-label="Jak liczymy punkty" onClick={() => setHelpOpen(true)}>
                <span aria-hidden="true">i</span>
              </button>
            }
            note="Najlepszy wynik w historii: zaliczona seria (min. 1 powtórzenie) na płaskiej ławce ze sztangą, przeliczona na wagę ciała z tamtego dnia."
          />
        </>
      )}
      {benchNeedsWeight && (
        <p className="rank-hint">
          Wpisz wagę w <Link to="/statystyki">Statystyki › Ciało</Link>, żeby liczyły się punkty z ławki.
        </p>
      )}
      {helpOpen && <DotsHelpSheet onClose={() => setHelpOpen(false)} />}
      <p className="rank-hint">
        Zalogowano jako <strong>{settings.rankNick}</strong>. Konto: Ustawienia › Konto.
      </p>
    </div>
  );
}

function Table({
  title,
  rows,
  me,
  prev,
  format,
  note,
  head,
  info,
}: {
  title: string;
  rows: Row[];
  me: string;
  prev?: number;
  format: (v: number) => string;
  note?: string;
  head?: ReactNode;
  info?: ReactNode;
}) {
  const mine = rows.findIndex((r) => r.nick === me) + 1;
  const up = prev && mine ? prev - mine : 0;
  return (
    <section className="rank-table" aria-label={title}>
      <div className="rank-table__head">
        <h2>{title}</h2>
        {info}
      </div>
      {head}
      {rows.length === 0 ? (
        <p className="rank-hint">Nikt jeszcze nie ma wyniku w tym okresie.</p>
      ) : (
        <ol>
          {rows.map((r, i) => (
            <li key={r.nick} className={r.nick === me ? 'rank-row rank-row--me' : 'rank-row'}>
              <span className="rank-row__place">{i + 1}.</span>
              <span className="rank-row__nick">{r.nick}</span>
              {r.nick === me && up !== 0 && (
                <span className={up > 0 ? 'rank-row__move rank-row__move--up' : 'rank-row__move'}>{up > 0 ? `↑ ${up}` : `↓ ${-up}`}</span>
              )}
              <span className="rank-row__value">{format(r.value)}</span>
            </li>
          ))}
        </ol>
      )}
      {note && <p className="rank-note">{note}</p>}
    </section>
  );
}
