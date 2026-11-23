import { useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, useLocation, useNavigate } from 'react-router';
import BottomNav from './components/BottomNav';
import StartPage from './pages/StartPage';
import PlansPage from './pages/PlansPage';
import PlanDetailPage from './pages/PlanDetailPage';
import PlanDayPage from './pages/PlanDayPage';
import ExercisesPage from './pages/ExercisesPage';
import ExerciseDetailPage from './pages/ExerciseDetailPage';
import ExerciseFormPage from './pages/ExerciseFormPage';
import HistoryPage from './pages/HistoryPage';
import WorkoutDetailPage from './pages/WorkoutDetailPage';
import StatsPage from './pages/StatsPage';
import SettingsPage from './pages/SettingsPage';
import ImportPage from './pages/ImportPage';
import BackupPage from './pages/BackupPage';
import WorkoutPage from './pages/WorkoutPage';
import WorkoutSummaryPage from './pages/WorkoutSummaryPage';
import { getActiveWorkout } from './data/workouts';

// Each new screen starts at the top (the page scroll would otherwise carry over).
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// After the app was closed mid-workout, it opens straight on the workout.
function ResumeWorkout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    if (pathname !== '/') return;
    void getActiveWorkout().then((w) => {
      if (w) navigate('/trening');
    });
  }, [navigate, pathname]);
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <ScrollToTop />
      <ResumeWorkout />
      <main>
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="/plany" element={<PlansPage />} />
          <Route path="/plany/:planId" element={<PlanDetailPage />} />
          <Route path="/plany/:planId/dni/:dayId" element={<PlanDayPage />} />
          <Route path="/cwiczenia" element={<ExercisesPage />} />
          <Route path="/cwiczenia/nowe" element={<ExerciseFormPage />} />
          <Route path="/cwiczenia/:id/edytuj" element={<ExerciseFormPage />} />
          <Route path="/cwiczenia/:id" element={<ExerciseDetailPage />} />
          <Route path="/historia" element={<HistoryPage />} />
          <Route path="/historia/:id" element={<WorkoutDetailPage />} />
          <Route path="/statystyki" element={<StatsPage />} />
          <Route path="/ustawienia" element={<SettingsPage />} />
          <Route path="/ustawienia/import" element={<ImportPage />} />
          <Route path="/ustawienia/kopia" element={<BackupPage />} />
          <Route path="/trening" element={<WorkoutPage />} />
          <Route path="/trening/podsumowanie/:id" element={<WorkoutSummaryPage />} />
        </Routes>
      </main>
      <BottomNav />
    </HashRouter>
  );
}
