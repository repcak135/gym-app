import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { X } from 'lucide-react';

import { routePayload } from '../data/payloadRouter';
import PasteLinkSheet from './PasteLinkSheet';
import './ScanQrSheet.css';

const NOT_OURS = 'To nie jest kod z tej aplikacji';

/**
 * Full-screen camera view that reads a QR code from a friend. It has to run inside the
 * app: on iPhone the system camera opens Safari, which has its own storage.
 */
export default function ScanQrSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let alive = true;
    let scanner: { stop: () => void; destroy: () => void } | null = null;
    let lastText = '';

    void import('qr-scanner')
      .then(async ({ default: QrScanner }) => {
        if (!alive) return;
        if (!(await QrScanner.hasCamera())) {
          if (alive) setError('Nie znaleziono aparatu w tym urządzeniu.');
          return;
        }
        if (!alive) return;
        const s = new QrScanner(
          video,
          (result) => {
            if (!alive || result.data === lastText) return;
            lastText = result.data;
            const routed = routePayload(result.data);
            if (routed.kind === 'unknown') {
              setMessage(NOT_OURS);
              return;
            }
            alive = false;
            s.stop();
            onClose();
            navigate(routed.path);
          },
          {
            preferredCamera: 'environment',
            returnDetailedScanResult: true,
            highlightScanRegion: false,
            highlightCodeOutline: false,
            maxScansPerSecond: 8,
          },
        );
        scanner = s;
        try {
          await s.start();
        } catch (e) {
          if (!alive) return;
          const text = String((e as Error)?.name ?? '') + String((e as Error)?.message ?? e);
          setError(
            /denied|NotAllowed|permission/i.test(text)
              ? 'Aplikacja nie ma zgody na aparat. Zezwól na dostęp do aparatu w ustawieniach telefonu.'
              : 'Nie udało się uruchomić aparatu.',
          );
        }
      })
      .catch(() => alive && setError('Nie udało się uruchomić skanera.'));

    return () => {
      alive = false;
      scanner?.stop();
      scanner?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scan" role="dialog" aria-label="Skaner kodów QR" aria-modal="true">
      <video ref={videoRef} className="scan__video" muted playsInline />
      <div className="scan__bar">
        <button type="button" className="scan__close" onClick={onClose}>
          <X size={20} aria-hidden="true" /> Zamknij
        </button>
      </div>
      {!error && <div className="scan__frame" aria-hidden="true" />}
      <div className="scan__bottom">
        {error ? (
          <>
            <p className="scan__text" role="alert">{error}</p>
            <button type="button" className="plan-btn plan-btn--primary" onClick={() => setPasting(true)}>
              Wklej link
            </button>
          </>
        ) : (
          <>
            <p className="scan__text" role={message ? 'alert' : undefined}>
              {message ?? 'Skieruj aparat na kod QR od znajomego.'}
            </p>
            <button type="button" className="scan__link" onClick={() => setPasting(true)}>
              Wklej link
            </button>
          </>
        )}
      </div>
      {pasting && (
        <div className="scan-paste">
          <PasteLinkSheet
            onCancel={() => setPasting(false)}
            onOpen={(path) => {
              onClose();
              navigate(path);
            }}
          />
        </div>
      )}
    </div>
  );
}
