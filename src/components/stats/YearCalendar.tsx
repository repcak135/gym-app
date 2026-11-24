import { useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { activityLevel, dayKey } from '../../data/motivation';
import type { DayActivity } from '../../data/motivation';
import { plural, setsLabel } from '../../data/plural';
import './YearCalendar.css';

const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const MONTHS_GEN = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];

interface Props {
  year: number;
  days: Map<string, DayActivity>;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onOpenDay: (key: string, a: DayActivity) => void;
}

export default function YearCalendar({ year, days, canPrev, canNext, onPrev, onNext, onOpenDay }: Props) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [todayKey] = useState(() => dayKey(Date.now()));

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    start.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = start.current;
    const t = e.changedTouches[0];
    start.current = null;
    if (!s || !t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0 && canNext) onNext();
      else if (dx > 0 && canPrev) onPrev();
    }
  };

  const n = days.size;

  return (
    <div className="ycal" role="group" aria-label={`Aktywność ${year}`}>
      <div className="ycal__head">
        <button type="button" className="icon-btn" aria-label="Poprzedni rok" disabled={!canPrev} onClick={onPrev}>
          <ChevronLeft size={20} />
        </button>
        <h3 className="ycal__year">{year}</h3>
        <button type="button" className="icon-btn" aria-label="Następny rok" disabled={!canNext} onClick={onNext}>
          <ChevronRight size={20} />
        </button>
      </div>
      <p className="ycal__count">
        {n} {plural(n, 'dzień treningowy', 'dni treningowe', 'dni treningowych')}
      </p>
      <div className="ycal__swipe" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="ycal__months" key={year}>
          {MONTHS_SHORT.map((name, m) => {
            const offset = (new Date(year, m, 1).getDay() + 6) % 7;
            const count = new Date(year, m + 1, 0).getDate();
            const cells = [];
            for (let i = 0; i < offset; i++) cells.push(<span key={`e${i}`} aria-hidden="true" className="ycal__empty" />);
            for (let d = 1; d <= count; d++) {
              const key = dayKey(new Date(year, m, d).getTime());
              const a = days.get(key);
              const today = key === todayKey ? ' ycal__day--today' : '';
              if (!a) {
                cells.push(<span key={key} aria-hidden="true" className={`ycal__day${today}`} />);
                continue;
              }
              const level = activityLevel(a.sets);
              cells.push(
                <button
                  key={key}
                  type="button"
                  data-level={level}
                  className={`ycal__day ycal__day--l${level}${today}`}
                  aria-label={`${d} ${MONTHS_GEN[m]} ${year}: ${setsLabel(a.sets)}`}
                  onClick={() => onOpenDay(key, a)}
                />,
              );
            }
            return (
              <div className="ycal__month" key={name}>
                <div className="ycal__mname">{name}</div>
                <div className="ycal__grid">{cells}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="ycal__legend">
        <span>Mniej</span>
        <span aria-hidden="true" className="ycal__sq" />
        <span aria-hidden="true" className="ycal__sq ycal__day--l1" />
        <span aria-hidden="true" className="ycal__sq ycal__day--l2" />
        <span aria-hidden="true" className="ycal__sq ycal__day--l3" />
        <span aria-hidden="true" className="ycal__sq ycal__day--l4" />
        <span>Więcej</span>
      </div>
    </div>
  );
}
