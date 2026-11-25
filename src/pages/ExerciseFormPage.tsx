import { useParams, useNavigate, useSearchParams, Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';

import ExerciseForm from '../components/ExerciseForm';
import './ExerciseFormPage.css';

export default function ExerciseFormPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const exerciseId = id ? decodeURIComponent(id) : null;

  const title = isEdit ? 'Edytuj ćwiczenie' : 'Nowe ćwiczenie';
  const backTo = isEdit && exerciseId
    ? `/cwiczenia/${encodeURIComponent(exerciseId)}`
    : '/cwiczenia';

  return (
    <article>
      <div className="form-header">
        <Link to={backTo} className="form-back" aria-label="Anuluj">
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <h1>{title}</h1>
      </div>

      <ExerciseForm
        key={exerciseId ?? 'new'}
        exerciseId={exerciseId}
        initialName={params.get('nazwa') ?? ''}
        onSaved={(savedId) => navigate(`/cwiczenia/${encodeURIComponent(savedId)}`, { replace: true })}
        onCancel={() => navigate(backTo)}
      />
    </article>
  );
}
