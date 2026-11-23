import { useEffect, useState } from 'react';

/** QR code drawn as one SVG path. The library (MIT) is loaded only when a code is shown. */
export default function QrCode({ text, label }: { text: string; label: string }) {
  const [qr, setQr] = useState<{ size: number; path: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    import('qrcode-generator')
      .then(({ default: qrcode }) => {
        const q = qrcode(0, 'L');
        q.addData(text);
        q.make();
        const n = q.getModuleCount();
        let path = '';
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) if (q.isDark(r, c)) path += `M${c + 4} ${r + 4}h1v1h-1z`;
        }
        if (alive) setQr({ size: n + 8, path });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [text]);

  if (failed) return <p className="plan-muted">Nie udało się narysować kodu QR — wyślij link.</p>;
  if (!qr) return <div className="qr qr--loading" aria-hidden="true" />;
  return (
    <svg
      className="qr"
      role="img"
      aria-label={label}
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      shapeRendering="crispEdges"
    >
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={qr.path} fill="#000" />
    </svg>
  );
}
