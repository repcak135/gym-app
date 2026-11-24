import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ChevronDown } from 'lucide-react';

import { db } from '../data/db';
import { formatReps } from '../data/plans';
import { createPlanFromCandidates, planCandidates, type DayCandidate } from '../data/planFromHistory';
import { formatDay } from './planFormat';
import { daysLabel } from '../data/plural';
import './PlansPage.css';
import './SettingsPage.css';
import './ImportPage.css';
import './PlanFromHistoryPage.css';

const LIMIT = 20;

export default function PlanFromHistoryPage() {
  const navigate = useNavigate();
  const candidates = useLiveQuery(() => planCandidates(LIMIT), []);
  const plans = useLiveQuery(() => db.plans.toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const nameOf = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e.name])), [exercises]);

  const [checked, setChecked] = useState<Set<string> | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string>('new'); // 'new' or a plan id
  const [newName, setNewName] = useState('Plan z historii');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [doneId, setDoneId] = useState<string | null>(null);

  // Default selection (once the candidates load): names that occurred at least twice.
  useEffect(() => {
    if (candidates && checked === null) {
      setChecked(new Set(candidates.filter((c) => c.occurrences >= 2).map((c) => c.sourceWorkoutId)));
    }
  }, [candidates, checked]);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const back = (
    <button type="button" className="plan-back settings-back" aria-label="Wróć" onClick={() => navigate('/ustawienia')}>
      <ArrowLeft size={18} aria-hidden="true" />
      Wróć
    </button>
  );

  if (!candidates || !plans || checked === null && candidates.length > 0) {
    return <article className="imp">{back}<h1>Plan z historii</h1></article>;
  }

  if (doneId) {
    return (
      <article className="imp">
        {back}
        <h1>Plan z historii</h1>
        <p className="imp-done" role="status">Plan został utworzony.</p>
        <Link to={`/plany/${doneId}`} className="plan-btn plan-btn--primary plan-btn--block">Otwórz plan</Link>
      </article>
    );
  }

  if (candidates.length === 0) {
    return (
      <article className="imp">
        {back}
        <h1>Plan z historii</h1>
        <p className="muted">
          Nie masz jeszcze żadnych zakończonych treningów, z których dałoby się zbudować plan. Zaimportuj historię
          z poprzedniej aplikacji albo zrób pierwszy trening.
        </p>
        <Link to="/ustawienia/import" className="plan-btn plan-btn--primary plan-btn--block">Importuj historię</Link>
      </article>
    );
  }

  const selected = candidates.filter((c) => checked?.has(c.sourceWorkoutId));
  const canSave = selected.length > 0 && !saving && (target !== 'new' || newName.trim() !== '');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const id = await createPlanFromCandidates(
        selected,
        target === 'new' ? { newPlanName: newName } : { planId: target },
      );
      setDoneId(id);
    } catch {
      setError('Nie udało się utworzyć planu.');
      setSaving(false);
    }
  };

  const card = (c: DayCandidate) => {
    const id = c.sourceWorkoutId;
    const expanded = open.has(id);
    return (
      <li key={id} className="pfh-card">
        <label className="pfh-card__head">
          <input
            type="checkbox"
            checked={checked?.has(id) ?? false}
            onChange={() => setChecked((s) => toggle(s ?? new Set(), id))}
          />
          <span className="pfh-card__text">
            <strong>{c.name}</strong>
            <span className="muted">ostatnio: {formatDay(c.lastDate)} · {c.occurrences}× w ostatnich {LIMIT}</span>
          </span>
        </label>
        <button
          type="button"
          className="imp-toggle pfh-card__toggle"
          aria-expanded={expanded}
          aria-label={`Ćwiczenia: ${c.name}`}
          onClick={() => setOpen((s) => toggle(s, id))}
        >
          {c.items.length} ćw.
          <ChevronDown size={16} aria-hidden="true" className={expanded ? 'imp-toggle__open' : ''} />
        </button>
        {expanded && (
          <ul className="pfh-items">
            {c.items.map((it, i) => (
              <li key={i}>
                <span>{nameOf.get(it.exerciseId) ?? '…'}</span>
                <span className="muted">{it.sets} × {formatReps(it)}</span>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <article className="imp">
      {back}
      <h1>Plan z historii</h1>
      <p className="muted">
        Bierzemy Twoje {LIMIT} ostatnich treningów. Każda nazwa treningu to jeden dzień planu, zbudowany z ostatniego takiego treningu.
      </p>

      <ul className="imp-list">{candidates.map(card)}</ul>

      <fieldset className="pfh-target">
        <legend>Gdzie dodać</legend>
        <label className="summary__radio">
          <input type="radio" name="pfh-target" checked={target === 'new'} onChange={() => setTarget('new')} />
          <span>Nowy plan</span>
        </label>
        {target === 'new' && (
          <label className="name-sheet__label">
            Nazwa nowego planu
            <input
              type="text"
              className="name-sheet__input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
        )}
        {plans.map((p) => (
          <label key={p.id} className="summary__radio">
            <input type="radio" name="pfh-target" checked={target === p.id} onChange={() => setTarget(p.id)} />
            <span>{p.name}</span>
          </label>
        ))}
      </fieldset>

      <p className="muted pfh-note">
        Przerwy ustawione z Ustawień, rozgrzewki tylko jeśli były oznaczone w historii — możesz to potem poprawić w planie.
      </p>
      {error && <p className="imp-error" role="alert">{error}</p>}

      <div className="imp-footer">
        <button type="button" className="plan-btn plan-btn--primary plan-btn--block" disabled={!canSave} onClick={() => void save()}>
          Utwórz plan ({daysLabel(selected.length)})
        </button>
      </div>
    </article>
  );
}
