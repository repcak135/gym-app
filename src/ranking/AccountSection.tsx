import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import type { AppSettings } from '../data/types';
import { ApiError } from './api';
import { errorText, leaveRanking, logout, signOutLocally, updateSharing } from './account';
import { NewPassword } from '../pages/RankingPage';
import '../pages/RankingPage.css';

/** Ustawienia › Konto: the ranking account on this phone. */
export default function AccountSection({ settings }: { settings: AppSettings }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const token = settings.rankToken;

  const run = async (f: () => Promise<void>, done?: string) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await f();
      if (done) setInfo(done);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) await signOutLocally();
      setError(errorText(e));
    }
    setBusy(false);
  };

  return (
    <section className="settings-group" aria-labelledby="set-account">
      <h2 id="set-account" className="settings-group__title">Konto</h2>
      {!token ? (
        <>
          <Link to="/statystyki/ranking" className="settings-row settings-link">
            <span className="settings-row__label">Ranking znajomych</span>
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
          <p className="settings-group__hint">Dobrowolny: dołącz z nickiem i hasłem, żeby porównać liczbę treningów i punkty z ławki.</p>
        </>
      ) : (
        <>
          <div className="settings-row">
            <span className="settings-row__label">Nick</span>
            <strong>{settings.rankNick}</strong>
          </div>
          <label className="settings-row settings-toggle">
            <span className="settings-row__label">Pokazuj liczbę treningów</span>
            <input
              type="checkbox"
              role="switch"
              checked={!!settings.rankShareWorkouts}
              disabled={busy}
              onChange={(e) => void run(() => updateSharing(token, e.target.checked, !!settings.rankShareBench))}
            />
          </label>
          <label className="settings-row settings-toggle">
            <span className="settings-row__label">Pokazuj punkty z ławki</span>
            <input
              type="checkbox"
              role="switch"
              checked={!!settings.rankShareBench}
              disabled={busy}
              onChange={(e) => void run(() => updateSharing(token, !!settings.rankShareWorkouts, e.target.checked))}
            />
          </label>
          <p className="settings-group__hint">
            Na serwerze jest tylko nick, liczba treningów i punkty z ławki. Wyłączenie usuwa te wyniki od razu.
          </p>
          {pwOpen ? (
            <NewPassword
              token={token}
              onDone={() => {
                setPwOpen(false);
                setInfo('Hasło zmienione. Inne telefony zostały wylogowane.');
              }}
            />
          ) : (
            <button type="button" className="settings-row settings-link settings-calc" onClick={() => setPwOpen(true)}>
              <span className="settings-row__label">Zmień hasło (też gdy nie pamiętasz starego)</span>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          )}
          <button type="button" className="settings-row settings-link settings-calc" disabled={busy} onClick={() => void run(() => logout(token))}>
            <span className="settings-row__label">Wyloguj z tego telefonu</span>
          </button>
          {confirmLeave ? (
            <div className="rank-leave" role="alertdialog" aria-label="Opuścić ranking?">
              <p>Opuścić ranking? Twoje konto, wyniki i kopie w chmurze znikną z serwera. Treningi w telefonie zostają.</p>
              <button type="button" className="confirm-sheet__btn confirm-sheet__btn--danger" disabled={busy} onClick={() => void run(() => leaveRanking(token))}>
                Tak, opuść ranking
              </button>
              <button type="button" className="confirm-sheet__btn confirm-sheet__btn--cancel" onClick={() => setConfirmLeave(false)}>
                Anuluj
              </button>
            </div>
          ) : (
            <button type="button" className="settings-row settings-link settings-calc settings-danger-text" onClick={() => setConfirmLeave(true)}>
              <span className="settings-row__label">Opuść ranking i usuń konto</span>
            </button>
          )}
        </>
      )}
      {error && (
        <p className="name-sheet__error" role="alert">
          {error}
        </p>
      )}
      {info && <p className="settings-deleted">{info}</p>}
    </section>
  );
}
