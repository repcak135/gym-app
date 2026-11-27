import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation } from 'react-router';
import { db } from '../data/db';
import { updateSettings } from '../data/settings';
import { getActiveWorkout } from '../data/workouts';
import type { AppSettings } from '../data/types';
import { enablePush, pushSupport, PUSH_ERRORS, standalone, type PushSupport } from './client';
import '../components/Sheet.css';

/**
 * Ask once per phone, only in the installed app (a browser tab is often a quick look; the
 * Ustawienia switch still works there): push works, it is off, and the question was never answered.
 */
export function shouldAskPush(
  settings: Pick<AppSettings, 'restPush' | 'pushPromptDone'> | undefined,
  support: PushSupport,
  installed: boolean,
): boolean {
  return installed && support === 'ok' && !settings?.restPush && !settings?.pushPromptDone;
}

/**
 * The owner wants the rest-end push on by default, but iOS and Chrome only show the permission
 * prompt after a tap. So the first workout screen asks once; "Włącz" asks the system from that tap.
 */
export default function PushPrompt() {
  const { pathname } = useLocation();
  const ask = useLiveQuery(async () => {
    if (!(await getActiveWorkout())) return false;
    return shouldAskPush(await db.settings.get('app'), pushSupport(), standalone());
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!pathname.startsWith('/trening') || (!ask && !error)) return null;

  const later = () => {
    setError(null);
    void updateSettings({ pushPromptDone: true });
  };
  const enable = async () => {
    setBusy(true);
    const r = await enablePush(); // permission request leaves synchronously from this tap
    if (r !== 'ok') setError(PUSH_ERRORS[r]);
    await updateSettings({ pushPromptDone: true });
    setBusy(false);
  };

  return (
    <div className="sheet-backdrop" onKeyDown={(e) => { if (e.key === 'Escape') later(); }}>
      <div role="dialog" aria-label="Powiadomienie o końcu przerwy?" aria-modal="true" className="sheet">
        <div className="sheet__handle" aria-hidden="true" />
        <div className="confirm-sheet__body">
          <p className="confirm-sheet__title">Powiadomienie o końcu przerwy?</p>
          {error ? (
            <p className="action-sheet__message" role="alert">{error} Możesz to włączyć później w Ustawieniach › Koniec przerwy.</p>
          ) : (
            <p className="action-sheet__message">
              Przy zablokowanym telefonie przyjdzie „Koniec przerwy”. Na serwer trafia tylko anonimowy adres powiadomień i godzina końca przerwy z nazwą ćwiczenia.
            </p>
          )}
          <div className="confirm-sheet__actions">
            {error ? (
              <button type="button" className="confirm-sheet__btn confirm-sheet__btn--cancel" onClick={later}>
                Zamknij
              </button>
            ) : (
              <>
                <button type="button" className="confirm-sheet__btn confirm-sheet__btn--primary" disabled={busy} onClick={() => void enable()}>
                  Włącz
                </button>
                <button type="button" className="confirm-sheet__btn confirm-sheet__btn--cancel" disabled={busy} onClick={later}>
                  Nie teraz
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
