import { useState } from 'react';
import { Share2, Copy } from 'lucide-react';

import { qrFits } from '../data/planShare';
import QrCode from './QrCode';
import '../pages/PlansPage.css';
import '../pages/PlanSharePage.css';

interface ShareLinkPanelProps {
  url: string;
  /** Title passed to navigator.share */
  shareTitle: string;
  /** Text passed to navigator.share, e.g. `Plan treningowy: ${name}` */
  shareText: string;
  qrLabel: string;
  tooLongText: string;
  linkLabel: string;
}

/** QR code (or "too long" note), share/copy buttons and a readonly link field. */
export default function ShareLinkPanel({ url, shareTitle, shareText, qrLabel, tooLongText, linkLabel }: ShareLinkPanelProps) {
  const [status, setStatus] = useState<string | null>(null);
  const canShare = typeof navigator.share === 'function';

  const share = async () => {
    try {
      await navigator.share({ title: shareTitle, text: shareText, url });
      setStatus(null);
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setStatus('Nie udało się otworzyć udostępniania — skopiuj link.');
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Skopiowano link');
    } catch {
      setStatus('Nie udało się skopiować — zaznacz link poniżej i skopiuj go ręcznie.');
    }
  };

  return (
    <>
      <div className="pshare__qr">
        {qrFits(url) ? (
          <QrCode text={url} label={qrLabel} />
        ) : (
          <p className="pshare__toolong" role="note">
            {tooLongText}
          </p>
        )}
      </div>

      <div className="pshare__actions">
        {canShare && (
          <button type="button" className="plan-btn plan-btn--primary plan-btn--block" onClick={() => void share()}>
            <Share2 size={18} aria-hidden="true" /> Udostępnij link
          </button>
        )}
        <button type="button" className="plan-btn plan-btn--block" onClick={() => void copy()}>
          <Copy size={18} aria-hidden="true" /> Kopiuj link
        </button>
      </div>
      {status && <p className="pshare__status" role="status">{status}</p>}

      <label className="pshare__label">
        {linkLabel}
        <textarea
          className="pshare__link"
          readOnly
          rows={3}
          value={url}
          onFocus={(e) => e.target.select()}
        />
      </label>
    </>
  );
}
