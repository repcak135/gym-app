import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';

import { db } from '../data/db';
import { getWorkoutDetail, workoutDurationSec } from '../data/history';
import { removeWorkoutUndoable } from '../data/undoable';
import { showUndo } from '../undo';
import { getSettings } from '../data/settings';
import { formatClock, formatKg } from '../data/progression';
import { rirToRpeLabel } from '../data/difficulty';
import type { WorkoutSet } from '../data/types';
import ConfirmSheet from '../components/ConfirmSheet';
import SetEditSheet from '../components/SetEditSheet';
import { formatDay } from './planFormat';
import { WEEKDAYS_SHORT } from './historyFormat';
import { workingSetsLabel } from '../data/plural';
import './HistoryPage.css';
import '../components/Sheet.css';
import './PlansPage.css';
import './WorkoutDetailPage.css';

export default function WorkoutDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const detail = useLiveQuery(async () => {
    const d = await getWorkoutDetail(id);
    const ids = d ? d.groups.map((g) => g.exerciseId) : [];
    const exs = await db.exercises.bulkGet(ids);
    const names = new Map<string, string>();
    ids.forEach((eid, i) => names.set(eid, exs[i]?.name ?? eid));
    return { d, names };
  }, [id]);
  const settings = useLiveQuery(() => getSettings(), []);
  const [editing, setEditing] = useState<WorkoutSet | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function goBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate('/historia');
  }

  if (!detail) return <article />;
  const { d, names } = detail;

  if (!d) {
    return (
      <article>
        <Link to="/historia" className="plan-back">
          <ArrowLeft size={18} aria-hidden="true" />
          Wróć
        </Link>
        <p>Nie znaleziono treningu.</p>
      </article>
    );
  }

  const { workout, groups } = d;
  const duration = workoutDurationSec(workout);
  const working = groups.reduce((n, g) => n + g.sets.filter((s) => !s.warmup).length, 0);

  return (
    <article>
      <button type="button" className="plan-back wd-back" onClick={goBack}>
        <ArrowLeft size={18} aria-hidden="true" />
        Wróć
      </button>
      <h1>{workout.name}</h1>
      <p className="plan-muted wd-sub">
        {formatDay(workout.startedAt)}, {WEEKDAYS_SHORT[new Date(workout.startedAt).getDay()]}
        {duration !== undefined && ` · ${formatClock(duration)}`}
        {` · ${workingSetsLabel(working)}`}
      </p>

      {groups.map((g) => {
        const name = names.get(g.exerciseId) ?? g.exerciseId;
        return (
          <section key={g.exerciseId + g.sets[0].id} className="wd-group" aria-label={name}>
            <Link to={`/cwiczenia/${encodeURIComponent(g.exerciseId)}`} className="wd-group__name">
              {name}
            </Link>
            <ul className="wd-sets">
              {g.sets.map((s, i) => {
                const text = `${formatKg(s.weight)} kg × ${s.reps} powt.`;
                // Same wording as the exercise history: "Rozgrzewka · RPE 8".
                const meta = [s.warmup ? 'Rozgrzewka' : null, s.rir !== undefined ? rirToRpeLabel(s.rir) : null]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="wd-set"
                      aria-label={`Seria ${i + 1}: ${text}${meta ? `, ${meta}` : ''}`}
                      onClick={() => setEditing(s)}
                    >
                      <span className="wd-set__num" aria-hidden="true">{i + 1}</span>
                      <span className="wd-set__body" aria-hidden="true">
                        <span>{text}</span>
                        {meta && <span className="wd-set__meta">{meta}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {groups.length === 0 && <p className="plan-muted">Brak serii w tym treningu.</p>}

      <button type="button" className="plan-btn plan-btn--block wd-delete" onClick={() => setConfirmDelete(true)}>
        Usuń trening
      </button>

      {editing && settings && (
        <SetEditSheet set={editing} showRir={settings.showRir} onClose={() => setEditing(null)} />
      )}

      {confirmDelete && (
        <ConfirmSheet
          title="Usunąć ten trening?"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void removeWorkoutUndoable(id).then((restore) => {
              showUndo('Usunięto trening', restore);
              navigate('/historia', { replace: true });
            });
          }}
        />
      )}
    </article>
  );
}
