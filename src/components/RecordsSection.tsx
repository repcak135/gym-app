import { useLiveQuery } from 'dexie-react-hooks';
import { Trophy } from 'lucide-react';
import { getExerciseRecords, getTimeDistanceRecords } from '../data/history';
import { formatDistance, formatDuration } from '../data/measure';
import { formatKg } from '../data/progression';
import { formatDay } from '../pages/planFormat';
import './RecordsSection.css';

/** Personal records of one exercise (warm-ups excluded). Renders nothing without history. */
export default function RecordsSection({ exerciseId }: { exerciseId: string }) {
  const rec = useLiveQuery(() => getExerciseRecords(exerciseId), [exerciseId]);
  const td = useLiveQuery(() => getTimeDistanceRecords(exerciseId), [exerciseId]);
  const extra = [
    ...(td?.longestTime ? [{ label: 'Najdłużej', value: formatDuration(td.longestTime.sec), at: td.longestTime.at }] : []),
    ...(td?.longestDistance
      ? [{ label: 'Najdalej', value: formatDistance(td.longestDistance.m, 'timeDistance'), at: td.longestDistance.at }]
      : []),
  ];
  if (!rec && extra.length === 0) return null;
  const tiles = [
    ...(rec ? [{ label: 'Najcięższa seria', value: `${formatKg(rec.heaviest.weight)} kg × ${rec.heaviest.reps}`, at: rec.heaviest.at }] : []),
    ...(rec
      ? [
          { label: 'Szac. maks. (1RM)', value: `${formatKg(rec.e1rm.value)} kg`, at: rec.e1rm.at },
          { label: 'Największa objętość', value: `${formatKg(rec.volume.value)} kg`, at: rec.volume.at },
        ]
      : []),
    ...extra,
  ];
  return (
    <section className="detail-section records" aria-label="Rekordy">
      <p className="detail-section-title">
        <Trophy size={14} aria-hidden="true" /> Rekordy
      </p>
      <div className="records__tiles">
        {tiles.map((t) => (
          <div key={t.label} className="records__tile">
            <span>{t.label}</span>
            <strong>{t.value}</strong>
            <small>{formatDay(t.at)}</small>
          </div>
        ))}
      </div>
      {rec && (
      <table className="records__table" aria-label="Najwięcej powtórzeń przy ciężarze">
        <thead>
          <tr><th scope="col">Ciężar</th><th scope="col">Najwięcej powt.</th><th scope="col">Kiedy</th></tr>
        </thead>
        <tbody>
          {rec?.repsAtWeight.map((r) => (
            <tr key={r.weight}>
              <td>{formatKg(r.weight)} kg</td>
              <td>{r.reps}</td>
              <td>{formatDay(r.at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </section>
  );
}
