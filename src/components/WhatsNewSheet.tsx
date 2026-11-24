import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Sparkles } from 'lucide-react';

import type { ChangelogEntry } from '../data/changelog';
import { getSettings } from '../data/settings';
import { decideWhatsNew, entriesSince, hasUserData, markVersionSeen } from '../data/whatsNew';
import { APP_VERSION } from '../version';
import './Sheet.css';
import '../pages/PlansPage.css';
import './WhatsNewSheet.css';

function formatReleaseDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** "Co nowego" list. Closing always remembers the current version, so it is not shown again. */
export default function WhatsNewSheet({
  title,
  entries,
  onClose,
  showVersions = entries.length > 1,
}: {
  title: string;
  entries: ChangelogEntry[];
  onClose: () => void;
  /** Version + date above each list (always in Ustawienia, which shows every version). */
  showVersions?: boolean;
}) {
  const close = () => {
    void markVersionSeen(APP_VERSION);
    onClose();
  };
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
    >
      <div role="dialog" aria-label={title} aria-modal="true" className="sheet whats-new">
        <div className="sheet__handle" aria-hidden="true" />
        <div className="whats-new__body">
          <h2 className="whats-new__title">
            <Sparkles size={20} aria-hidden="true" /> {title}
          </h2>
          {entries.map((e) => (
            <section key={e.version} className="whats-new__entry" aria-label={`Wersja ${e.version}`}>
              {showVersions && (
                <p className="whats-new__version">
                  Wersja {e.version} <span>· {formatReleaseDate(e.date)}</span>
                </p>
              )}
              <ul className="whats-new__items">
                {e.items.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </section>
          ))}
          <button type="button" className="plan-btn plan-btn--primary plan-btn--block" onClick={close} autoFocus>
            Super, zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shown once after an update; a brand-new user just gets the version remembered. */
export function WhatsNewOnLaunch() {
  const { pathname } = useLocation();
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await getSettings();
      const decision = decideWhatsNew(s.lastSeenVersion, APP_VERSION, await hasUserData());
      if (cancelled) return;
      if (decision === 'store') await markVersionSeen(APP_VERSION);
      // Never on top of a running workout; it waits for the next launch.
      else if (decision === 'show' && !window.location.hash.startsWith('#/trening')) {
        setEntries(entriesSince(s.lastSeenVersion));
      }
    })();
    return () => { cancelled = true; };
  }, []);
  if (!entries || pathname.startsWith('/trening')) return null;
  return (
    <WhatsNewSheet
      title={`Co nowego w ${APP_VERSION}`}
      entries={entries}
      onClose={() => setEntries(null)}
    />
  );
}
