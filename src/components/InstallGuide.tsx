import { useEffect, useState, type ReactNode } from 'react';
import { Download, EllipsisVertical, MonitorDown, Share, SquarePlus, TriangleAlert, X } from 'lucide-react';

import {
  canPromptInstall,
  detectPlatform,
  guideDue,
  hideGuideForGood,
  isOtherIosBrowser,
  isStandalone,
  onInstallPromptChange,
  promptInstall,
  readGuideState,
  snoozeGuide,
  type GuidePlatform,
} from '../data/installGuide';
import Segmented from './stats/Segmented';
import '../pages/PlansPage.css';
import './Sheet.css';
import './InstallGuide.css';

const PLATFORMS: { key: GuidePlatform; label: string }[] = [
  { key: 'ios', label: 'iPhone' },
  { key: 'android', label: 'Android' },
  { key: 'desktop', label: 'Komputer' },
];

/** Inline picture of a button the steps mention. */
function Key({ children }: { children: ReactNode }) {
  return <span className="install-key" aria-hidden="true">{children}</span>;
}

function useCanPrompt(): boolean {
  const [can, setCan] = useState(canPromptInstall);
  useEffect(() => onInstallPromptChange(() => setCan(canPromptInstall())), []);
  return can;
}

/** Steps for each system, with tabs to switch; opens on the detected one. */
export function InstallSteps() {
  const ua = navigator.userAgent;
  const [platform, setPlatform] = useState<GuidePlatform>(() => detectPlatform(ua, navigator.maxTouchPoints));
  const canPrompt = useCanPrompt();
  return (
    <div className="install-steps">
      <Segmented<GuidePlatform> label="System telefonu" options={PLATFORMS} value={platform} onChange={setPlatform} />

      {platform === 'ios' && (
        <>
          <ol className="install-list">
            <li>Otwórz tę stronę w <strong>Safari</strong>.</li>
            <li>Dotknij <Key><Share size={16} /></Key> <strong>Udostępnij</strong> (na dole ekranu).</li>
            <li>Przewiń w dół i wybierz <Key><SquarePlus size={16} /></Key> <strong>Do ekranu początkowego</strong>.</li>
            <li>Zostaw włączone <strong>„Otwórz jako aplikację www”</strong> i dotknij <strong>Dodaj</strong>.</li>
            <li>Uruchamiaj aplikację ikoną <strong>Gym</strong> z ekranu początkowego.</li>
          </ol>
          <p className="install-note">
            {isOtherIosBrowser(ua) ? 'Używasz Chrome lub innej przeglądarki: ' : 'W Chrome na iPhonie: '}
            przycisk <Key><Share size={16} /></Key> Udostępnij jest obok paska adresu, dalej tak samo.
          </p>
        </>
      )}

      {platform === 'android' && (
        <>
          {canPrompt && (
            <button type="button" className="plan-btn plan-btn--primary plan-btn--block" onClick={() => void promptInstall()}>
              <Download size={18} aria-hidden="true" /> Zainstaluj
            </button>
          )}
          <ol className="install-list">
            <li>Otwórz tę stronę w <strong>Chrome</strong>.</li>
            <li>Dotknij menu <Key><EllipsisVertical size={16} /></Key> w prawym górnym rogu.</li>
            <li>Wybierz <strong>„Zainstaluj aplikację”</strong> (albo <strong>„Dodaj do ekranu głównego”</strong>) i potwierdź.</li>
            <li>Uruchamiaj aplikację ikoną <strong>Gym</strong>.</li>
          </ol>
        </>
      )}

      {platform === 'desktop' && (
        <>
          <ol className="install-list">
            <li>W Chrome lub Edge kliknij ikonę <Key><MonitorDown size={16} /></Key> instalacji po prawej stronie paska adresu.</li>
            <li>Kliknij <strong>Zainstaluj</strong>.</li>
          </ol>
          <p className="install-note">Aplikacja jest zrobiona głównie na telefon — najlepiej zainstaluj ją tam.</p>
        </>
      )}

      <p className="install-warning" role="note">
        <TriangleAlert size={18} aria-hidden="true" />
        <span>
          Najpierw zainstaluj, potem zacznij używać. Na iPhonie dane w karcie przeglądarki i w zainstalowanej aplikacji są
          osobne. Jeśli masz tu już jakieś dane, zrób kopię (Ustawienia › Kopia zapasowa) i wczytaj ją w zainstalowanej aplikacji.
        </span>
      </p>
    </div>
  );
}

/** Start screen, browser tab only: shown on the first visit until "Nie teraz" (7 days) or "Mam już zainstalowaną". */
export function InstallCard() {
  const [show, setShow] = useState(() => !isStandalone() && guideDue(readGuideState(), Date.now()));
  if (!show) return null;
  return (
    <section className="install-card" aria-label="Zainstaluj aplikację na telefonie">
      <h2 className="install-card__title">Zainstaluj aplikację na telefonie</h2>
      <p className="install-card__lead">Ikona na ekranie, pełny ekran i działanie bez internetu — jak zwykła aplikacja.</p>
      <InstallSteps />
      <div className="install-card__actions">
        <button type="button" className="plan-btn" onClick={() => { snoozeGuide(); setShow(false); }}>
          Nie teraz
        </button>
        <button type="button" className="plan-btn" onClick={() => { hideGuideForGood(); setShow(false); }}>
          Mam już zainstalowaną
        </button>
      </div>
    </section>
  );
}

/** Ustawienia → "Jak zainstalować na telefonie". */
export default function InstallGuideSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div role="dialog" aria-label="Jak zainstalować na telefonie" aria-modal="true" className="sheet sheet--split">
        <div className="sheet__header install-sheet__head">
          <div className="sheet__handle" aria-hidden="true" />
          <div className="install-sheet__bar">
            <h2 className="install-card__title">Jak zainstalować na telefonie</h2>
            <button type="button" className="install-sheet__close" aria-label="Zamknij" onClick={onClose}>
              <X size={22} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="sheet__body install-sheet__body">
          {isStandalone() && <p className="install-note">Ta aplikacja jest już zainstalowana na tym urządzeniu.</p>}
          <InstallSteps />
        </div>
      </div>
    </div>
  );
}
