import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { haptic, motionMs } from '../haptics';
import './SwipeRow.css';

interface SwipeRowProps {
  /** Name of the row, used in the delete button label ("Usuń: …"). */
  label: string;
  /** Called after the row slid out. Return false when nothing was deleted: the row comes back. */
  onDelete: () => Promise<boolean | void> | boolean | void;
  children: ReactNode;
  className?: string;
  /** Position in the list, for the staggered enter animation. */
  index?: number;
}

const EDGE = 24; // px from the left screen edge left to the iOS back swipe
const LOCK = 10; // px of movement before deciding horizontal vs vertical
const OPEN = 88; // width of the revealed delete button
const FULL = 0.55; // share of the row width that deletes on release

// Only one row is open at a time.
let closeOpen: (() => void) | null = null;

type Drag = { id: number; x: number; y: number; base: number; mode: 'wait' | 'h' | 'v' };

export default function SwipeRow({ label, onDelete, children, className, index }: SwipeRowProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const offset = useRef(0);
  const moved = useRef(false);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'out' | 'gone'>('idle');

  const setX = (x: number, animate: boolean) => {
    offset.current = x;
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animate ? '' : 'none';
    el.style.transform = x === 0 ? '' : `translateX(${x}px)`;
  };

  // Same function across renders, so "the open row" can be compared and closed from outside.
  const closeRef = useRef<() => void>(() => {});
  const [stableClose] = useState(() => () => closeRef.current());

  const close = () => {
    setX(0, true);
    setOpen(false);
    if (closeOpen === stableClose) closeOpen = null;
  };
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => () => {
    if (closeOpen === stableClose) closeOpen = null;
  }, [stableClose]);

  // Tapping anywhere outside an open row closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  });

  const remove = async () => {
    const root = rootRef.current;
    if (!root || phase !== 'idle') return;
    haptic('delete');
    setPhase('out');
    setX(-root.offsetWidth, true);
    await wait(motionMs(200));
    // Collapse the gap so the rows below glide up.
    root.style.height = `${root.offsetHeight}px`;
    void root.offsetHeight;
    root.classList.add('swipe-row--collapse');
    root.style.height = '0px';
    await wait(motionMs(180));
    setPhase('gone');
    let result: boolean | void = undefined;
    try {
      result = await onDelete();
    } catch {
      result = false;
    }
    if (result === false && rootRef.current) {
      // Not deleted (e.g. the exercise is still used): bring the row back.
      root.classList.remove('swipe-row--collapse');
      root.style.height = '';
      setPhase('idle');
      close();
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (phase !== 'idle' || !e.isPrimary || e.button !== 0) return;
    if (e.clientX < EDGE && !open) return;
    if (closeOpen && closeOpen !== stableClose) closeOpen();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, base: offset.current, mode: 'wait' };
    moved.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.mode === 'wait') {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.2 && (dx < 0 || d.base < 0)) {
        d.mode = 'h';
        moved.current = true;
        setDragging(true);
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
      } else {
        d.mode = 'v';
        drag.current = null;
        return;
      }
    }
    const width = rootRef.current?.offsetWidth ?? 320;
    let x = Math.min(0, d.base + dx);
    if (x < -width) x = -width - (-(x + width)) * 0.3; // rubber band past the edge
    setX(x, false);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.mode !== 'h') return;
    setDragging(false);
    const width = rootRef.current?.offsetWidth ?? 320;
    const x = offset.current;
    if (x <= -width * FULL) {
      void remove();
    } else if (x <= -OPEN / 2) {
      setX(-OPEN, true);
      setOpen(true);
      closeOpen = stableClose;
    } else {
      close();
    }
  };

  const onPointerCancel = () => {
    if (drag.current?.mode === 'h') close();
    drag.current = null;
    setDragging(false);
  };

  // A drag must not also click the link or button under the finger.
  const onClickCapture = (e: React.MouseEvent) => {
    if (moved.current) {
      e.preventDefault();
      e.stopPropagation();
      moved.current = false;
      return;
    }
    if (open && contentRef.current?.contains(e.target as Node)) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const classes = ['swipe-row', dragging && 'swipe-row--dragging', open && 'swipe-row--open', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={rootRef}
      className={classes}
      data-phase={phase}
      style={index === undefined ? undefined : ({ '--i': index } as React.CSSProperties)}
    >
      <button
        type="button"
        className="swipe-row__action"
        aria-label={`Usuń: ${label}`}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={() => void remove()}
      >
        <span className="swipe-row__label">
          <Trash2 size={20} aria-hidden="true" />
          Usuń
        </span>
      </button>
      <div
        ref={contentRef}
        className="swipe-row__content"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
        onDragStartCapture={(e) => e.preventDefault()}
      >
        {children}
      </div>
    </div>
  );
}

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
