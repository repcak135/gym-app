import { useState } from 'react';
import { disablePush, enablePush, pushSupport, type EnableResult } from './client';
import { pushConfigured } from './config';

const ERRORS: Record<Exclude<EnableResult, 'ok'>, string> = {
  denied: 'Powiadomienia są zablokowane. Włącz je w Ustawieniach telefonu → Powiadomienia → Banana Gym i spróbuj ponownie.',
  unsupported: 'Ten telefon albo przeglądarka nie obsługuje powiadomień.',
  error: 'Nie udało się połączyć z serwerem powiadomień. Sprawdź internet i spróbuj ponownie.',
};

/** Ustawienia › Koniec przerwy: opt-in push at rest end while the phone is locked. */
export default function PushSetting({ on, pushId }: { on: boolean; pushId?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!pushConfigured()) return null;
  const support = pushSupport();

  const toggle = async (want: boolean) => {
    setBusy(true);
    setError(null);
    if (want) {
      const r = await enablePush();
      if (r !== 'ok') setError(ERRORS[r]);
    } else {
      await disablePush(pushId);
    }
    setBusy(false);
  };

  return (
    <>
      <label className="settings-row settings-toggle">
        <span className="settings-row__label">Powiadomienie przy zablokowanym ekranie</span>
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={busy || (support !== 'ok' && !on)}
          onChange={(e) => void toggle(e.target.checked)}
        />
      </label>
      {support === 'needs-install' && (
        <p className="settings-group__hint">Na iPhonie działa tylko w aplikacji dodanej do ekranu początkowego (iOS 16.4 lub nowszy).</p>
      )}
      {support === 'unsupported' && <p className="settings-group__hint">{ERRORS.unsupported}</p>}
      {error && (
        <p className="settings-group__hint settings-push-error" role="alert">
          {error}
        </p>
      )}
      <p className="settings-group__hint settings-push-info">
        Gdy aplikacja jest schowana albo telefon zablokowany, na koniec przerwy przyjdzie powiadomienie „Koniec przerwy”. Żeby to działało,
        telefon wysyła na nasz serwer tylko anonimowy adres powiadomień, godzinę końca przerwy i jej opis (numer serii i nazwę ćwiczenia).
        Ciężary, historia i plany zostają w telefonie. Wpis znika z serwera zaraz po wysłaniu powiadomienia.
      </p>
    </>
  );
}
