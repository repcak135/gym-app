import { useEffect } from 'react';

/**
 * iPhone keyboard: fixed sheets stay attached to the layout viewport, so the keyboard covers
 * bottom sheets and iOS may scroll the page under a top one. This keeps two CSS variables in step
 * with the visual viewport: --kb-inset (px hidden at the bottom) and --kb-top (px scrolled away at the top).
 */
export default function KeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement.style;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        // Small differences are browser chrome (URL bar), not a keyboard.
        root.setProperty('--kb-inset', `${inset > 80 ? inset : 0}px`);
        root.setProperty('--kb-top', `${Math.max(0, Math.round(vv.offsetTop))}px`);
      });
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return null;
}
