import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

import { CHANGELOG, type ChangelogEntry } from '../data/changelog';
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

/**
 * "Co nowego": one version per page, newest first; arrows (or a swipe) go to older and newer versions.
 * Closing always remembers the current version, so the launch sheet is not shown again.
 */
export default function WhatsNewSheet({
  title,
  entries,
  onClose,
  newCount = 0,
}: {
  title: string;
  /** All versions to browse, newest first. */
  entries: ChangelogEntry[];
  onClose: () => void;
  /** How many of the newest entries are new since the last visit (badge "nowe"). */
  newCount?: number;
  /** Older prop, ignored: every page shows its version and date. */
  showVersions?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Focus the close button without scrolling the list to it (autoFocus opened long notes at the bottom).
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);
  // Another version starts at the top of its list.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [index]);
  const close = () => {
    void markVersionSeen(APP_VERSION);
    onClose();
  };
  const entry = entries[Math.min(index, entries.length - 1)];
  const canOlder = index < entries.length - 1;
  const canNewer = index > 0;
  const older = () => canOlder && setIndex(index + 1);
  const newer = () => canNewer && setIndex(index - 1);
  if (!entry) return null;
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') older();
        else if (e.key === 'ArrowRight') newer();
      }}
    >
      <div role="dialog" aria-label={title} aria-modal="true" className="sheet sheet--split whats-new">
        <div className="sheet__header whats-new__head">
          <div className="sheet__handle" aria-hidden="true" />
          <h2 className="whats-new__title">
            <Sparkles size={20} aria-hidden="true" /> {title}
          </h2>
          {entries.length > 1 && (
            <nav className="whats-new__nav" aria-label="Wersje">
              <button type="button" className="whats-new__arrow" onClick={older} disabled={!canOlder} aria-label="Starsza wersja">
                <ChevronLeft size={20} aria-hidden="true" /> Starsza
              </button>
              <span className="whats-new__pos" aria-live="polite">
                {index + 1} / {entries.length}
              </span>
              <button type="button" className="whats-new__arrow" onClick={newer} disabled={!canNewer} aria-label="Nowsza wersja">
                Nowsza <ChevronRight size={20} aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
        <div
          ref={bodyRef}
          className="sheet__body whats-new__body"
          onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
          onTouchEnd={(e) => {
            const start = touchX.current;
            touchX.current = null;
            const end = e.changedTouches[0]?.clientX;
            if (start === null || end === undefined || Math.abs(end - start) < 60) return;
            if (end > start) older(); // finger moves right: back in time
            else newer();
          }}
        >
          <section key={entry.version} className="whats-new__entry" aria-label={`Wersja ${entry.version}`}>
            <p className="whats-new__version">
              Wersja {entry.version} <span>· {formatReleaseDate(entry.date)}</span>
              {index < newCount && <span className="whats-new__badge">nowe</span>}
            </p>
            <ul className="whats-new__items">
              {entry.items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </section>
          <button type="button" className="plan-btn plan-btn--primary plan-btn--block" onClick={close} ref={closeRef}>
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
  const [newCount, setNewCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await getSettings();
      const decision = decideWhatsNew(s.lastSeenVersion, APP_VERSION, await hasUserData());
      if (cancelled) return;
      if (decision === 'store') await markVersionSeen(APP_VERSION);
      // Never on top of a running workout; it waits for the next launch.
      else if (decision === 'show' && !window.location.hash.startsWith('#/trening')) {
        setNewCount(entriesSince(s.lastSeenVersion).length);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  if (newCount === null || pathname.startsWith('/trening')) return null;
  return (
    <WhatsNewSheet
      title={`Co nowego w ${APP_VERSION}`}
      entries={CHANGELOG}
      newCount={newCount}
      onClose={() => setNewCount(null)}
    />
  );
}
