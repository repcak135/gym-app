import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ChevronDown, FileUp } from 'lucide-react';

import { db } from '../data/db';
import { seedExercises } from '../data/exercises';
import { AUTO_MIN, ImportFormatError, PRESELECT_MIN } from '../data/csvImport';
import { commitImport, prepareImport, type ImportChoice, type ImportPreview } from '../data/importHistory';
import ExercisePicker from '../components/ExercisePicker';
import './PlansPage.css';
import './SettingsPage.css';
import './ImportPage.css';

type Step =
  | { kind: 'pick'; error?: string }
  | { kind: 'loading' }
  | { kind: 'match'; preview: ImportPreview }
  | { kind: 'saving'; preview: ImportPreview }
  | { kind: 'done'; workouts: number; sets: number; created: number };

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const l = n % 10;
  const l2 = n % 100;
  return l >= 2 && l <= 4 && !(l2 >= 12 && l2 <= 14) ? few : many;
}
const workoutsLabel = (n: number) => `${n} ${plural(n, 'trening', 'treningi', 'treningów')}`;
const setsLabel = (n: number) => `${n} ${plural(n, 'seria', 'serie', 'serii')}`;

function initialChoices(p: ImportPreview): Record<string, ImportChoice> {
  return Object.fromEntries(
    p.names.map((n) => [
      n.sourceName,
      n.exerciseId && (n.how !== 'fuzzy' || n.score >= PRESELECT_MIN) ? n.exerciseId : 'custom',
    ]),
  );
}

export default function ImportPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [choices, setChoices] = useState<Record<string, ImportChoice>>({});
  const [picking, setPicking] = useState<string | null>(null);
  const [showAuto, setShowAuto] = useState(false);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const nameOf = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e.name])), [exercises]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setStep({ kind: 'loading' });
    try {
      // On a fresh install the exercise database may still be loading; matching needs all of it.
      await seedExercises();
      const preview = await prepareImport(await file.text());
      setChoices(initialChoices(preview));
      setShowAuto(false);
      setStep({ kind: 'match', preview });
    } catch (e) {
      setStep({
        kind: 'pick',
        error: e instanceof ImportFormatError ? e.message : 'Nie udało się odczytać pliku. Wybierz plik CSV z eksportu.',
      });
    }
  };

  const runImport = async (preview: ImportPreview) => {
    setStep({ kind: 'saving', preview });
    try {
      const res = await commitImport(preview, choices);
      setStep({ kind: 'done', ...res });
    } catch {
      setStep({ kind: 'pick', error: 'Import się nie udał. Nic nie zostało zapisane — spróbuj jeszcze raz.' });
    }
  };

  const back = (
    <button
      type="button"
      className="plan-back settings-back"
      aria-label="Wróć"
      onClick={() => navigate('/ustawienia')}
    >
      <ArrowLeft size={18} aria-hidden="true" />
      Wróć
    </button>
  );

  if (step.kind === 'pick' || step.kind === 'loading') {
    return (
      <article className="imp">
        {back}
        <h1>Importuj historię</h1>
        <p className="muted">
          Wybierz plik CSV wyeksportowany z poprzedniej aplikacji (kolumny Date, Workout name, Exercise, Set, Weight, Reps…).
          Na iPhonie zapisz go najpierw w aplikacji Pliki (np. iCloud Drive).
        </p>
        <ul className="imp-notes">
          <li>Każda seria wchodzi jako robocza — rozgrzewki możesz potem oznaczyć w Historii.</li>
          <li>Zaimportowane treningi nie mają czasu trwania.</li>
          <li>Ponowny import tego samego pliku nie doda drugi raz tych samych treningów.</li>
        </ul>
        <label className={`plan-btn plan-btn--primary plan-btn--block imp-file${step.kind === 'loading' ? ' imp-file--busy' : ''}`}>
          <FileUp size={20} aria-hidden="true" />
          {step.kind === 'loading' ? 'Czytam plik…' : 'Wybierz plik CSV'}
          <input
            type="file"
            accept=".csv,text/csv,text/comma-separated-values,text/plain"
            aria-label="Plik CSV"
            disabled={step.kind === 'loading'}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              void onFile(f);
            }}
          />
        </label>
        {step.kind === 'pick' && step.error && <p className="imp-error" role="alert">{step.error}</p>}
      </article>
    );
  }

  if (step.kind === 'done') {
    return (
      <article className="imp">
        <h1>Gotowe</h1>
        <p className="imp-done" role="status">
          Zaimportowano {workoutsLabel(step.workouts)} ({setsLabel(step.sets)}).
          {step.created > 0 && ` Utworzono ${step.created} ${plural(step.created, 'własne ćwiczenie', 'własne ćwiczenia', 'własnych ćwiczeń')}.`}
        </p>
        <Link to="/historia" className="plan-btn plan-btn--primary plan-btn--block">Pokaż historię</Link>
        <button type="button" className="plan-btn plan-btn--block imp-again" onClick={() => setStep({ kind: 'pick' })}>
          Importuj kolejny plik
        </button>
      </article>
    );
  }

  const { preview } = step;
  const saving = step.kind === 'saving';
  const review = preview.names.filter((n) => n.how === 'none' || (n.how === 'fuzzy' && n.score < AUTO_MIN));
  const auto = preview.names.filter((n) => n.how === 'fuzzy' && n.score >= AUTO_MIN);
  const known = preview.names.length - review.length - auto.length;

  const row = (n: ImportPreview['names'][number]) => {
    const choice = choices[n.sourceName];
    const custom = choice === 'custom';
    return (
      <li key={n.sourceName} className="imp-row" aria-label={n.sourceName}>
        <div className="imp-row__src">
          <strong>{n.sourceName}</strong>
          <span className="muted">{setsLabel(n.sets)}</span>
        </div>
        <div className={`imp-row__choice${custom ? ' imp-row__choice--custom' : ''}`}>
          <span aria-hidden="true">→ </span>
          {custom ? 'Nowe własne ćwiczenie' : (nameOf.get(choice) ?? '…')}
        </div>
        {custom && n.exerciseId && (
          <div className="imp-row__suggest muted">Propozycja: {nameOf.get(n.exerciseId) ?? '…'}</div>
        )}
        <div className="imp-row__actions">
          <button type="button" className="plan-btn" disabled={saving} onClick={() => setPicking(n.sourceName)}>
            Zmień
          </button>
          {custom ? (
            n.exerciseId && (
              <button
                type="button"
                className="plan-btn"
                disabled={saving}
                onClick={() => setChoices((c) => ({ ...c, [n.sourceName]: n.exerciseId! }))}
              >
                Użyj propozycji
              </button>
            )
          ) : (
            <button
              type="button"
              className="plan-btn"
              disabled={saving}
              onClick={() => setChoices((c) => ({ ...c, [n.sourceName]: 'custom' }))}
            >
              Jako własne
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <article className="imp">
      {back}
      <h1>Dopasuj ćwiczenia</h1>
      <p className="imp-summary" role="status">
        {preview.newWorkouts > 0
          ? `W pliku: ${workoutsLabel(preview.newWorkouts)} do dodania (${setsLabel(preview.sets)}).`
          : 'Wszystkie treningi z tego pliku są już zaimportowane.'}
        {preview.existingWorkouts > 0 && ` Już zaimportowane: ${preview.existingWorkouts} — zostaną pominięte.`}
        {preview.skipped > 0 && ` Pominięte błędne wiersze: ${preview.skipped}.`}
      </p>

      {preview.newWorkouts > 0 && (
        <>
          {known > 0 && (
            <p className="muted imp-known">
              {known} {plural(known, 'ćwiczenie pasuje', 'ćwiczenia pasują', 'ćwiczeń pasuje')} dokładnie do bazy.
            </p>
          )}

          {review.length > 0 && (
            <section aria-labelledby="imp-review">
              <h2 id="imp-review" className="settings-group__title">Do sprawdzenia ({review.length})</h2>
              <p className="muted imp-hint">
                Sprawdź każdą pozycję. Zielone — dopasowane do ćwiczenia z bazy. Pomarańczowe — zostaną dodane jako Twoje własne ćwiczenia (niepewną propozycję możesz wybrać przyciskiem).
              </p>
              <ul className="imp-list">{review.map(row)}</ul>
            </section>
          )}

          {auto.length > 0 && (
            <section aria-labelledby="imp-auto">
              <h2 id="imp-auto" className="settings-group__title">
                <button
                  type="button"
                  className="imp-toggle"
                  aria-expanded={showAuto}
                  onClick={() => setShowAuto((s) => !s)}
                >
                  Dopasowane automatycznie ({auto.length})
                  <ChevronDown size={16} aria-hidden="true" className={showAuto ? 'imp-toggle__open' : ''} />
                </button>
              </h2>
              {showAuto && <ul className="imp-list">{auto.map(row)}</ul>}
            </section>
          )}
        </>
      )}

      <div className="imp-footer">
        {preview.newWorkouts > 0 ? (
          <button
            type="button"
            className="plan-btn plan-btn--primary plan-btn--block"
            disabled={saving}
            onClick={() => void runImport(preview)}
          >
            {saving ? 'Importuję…' : `Importuj ${workoutsLabel(preview.newWorkouts)}`}
          </button>
        ) : (
          <button type="button" className="plan-btn plan-btn--block" onClick={() => setStep({ kind: 'pick' })}>
            Wybierz inny plik
          </button>
        )}
      </div>

      {picking && (
        <ExercisePicker
          title="Wybierz ćwiczenie"
          existingIds={[]}
          single
          onDone={(ids) => {
            if (ids[0]) setChoices((c) => ({ ...c, [picking]: ids[0] }));
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </article>
  );
}
