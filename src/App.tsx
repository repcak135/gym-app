import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HashRouter, Routes, Route, useLocation, useNavigate } from 'react-router';
import BottomNav from './components/BottomNav';
import UndoToast from './components/UndoToast';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './data/db';
import { setHapticsEnabled } from './haptics';
import StartPage from './pages/StartPage';
import PlansPage from './pages/PlansPage';
import PlanDetailPage from './pages/PlanDetailPage';
import PlanDayPage from './pages/PlanDayPage';
import PlanSharePage from './pages/PlanSharePage';
import PlanImportPage from './pages/PlanImportPage';
import ReportPage from './pages/ReportPage';
import ExercisesPage from './pages/ExercisesPage';
import ExerciseDetailPage from './pages/ExerciseDetailPage';
import ExerciseSharePage from './pages/ExerciseSharePage';
import ExercisesImportPage from './pages/ExercisesImportPage';
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

// Short pulses follow Ustawienia > Wibracja.
function HapticsSetting() {
  const vibration = useLiveQuery(async () => (await db.settings.get('app'))?.restVibration, []);
  useEffect(() => {
    setHapticsEnabled(vibration !== false);
  }, [vibration]);
  return null;
}

const depth = (path: string) => path.split('/').filter(Boolean).length;

/** Keyed on the path so each screen plays a short enter animation; direction from path depth. */
function Screen({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // "Previous path" kept in state and updated during render (React's derived-state pattern).
  const [seen, setSeen] = useState({ path: pathname, dir: 'fade' });
  let dir = seen.dir;
  if (seen.path !== pathname) {
    const a = depth(seen.path);
    const b = depth(pathname);
    dir = b > a ? 'fwd' : b < a ? 'back' : 'fade';
    setSeen({ path: pathname, dir });
  }
  const kind = pathname.startsWith('/trening') ? 'still' : dir;
  return (
    <div key={pathname} className={`screen screen--${kind}`}>
      {children}
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ScrollToTop />
      <ResumeWorkout />
      <HapticsSetting />
      <main>
        <Screen>
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="/plany" element={<PlansPage />} />
          <Route path="/plany/:planId" element={<PlanDetailPage />} />
          <Route path="/plany/:planId/dni/:dayId" element={<PlanDayPage />} />
          <Route path="/plany/:planId/wyslij" element={<PlanSharePage />} />
          <Route path="/plan" element={<PlanImportPage />} />
          <Route path="/cwiczenia" element={<ExercisesPage />} />
          <Route path="/cwiczenia/wyslij" element={<ExerciseSharePage />} />
          <Route path="/cwiczenia/import" element={<ExercisesImportPage />} />
          <Route path="/cwiczenia/:id/wyslij" element={<ExerciseSharePage />} />
          <Route path="/cwiczenia/nowe" element={<ExerciseFormPage />} />
          <Route path="/cwiczenia/:id/edytuj" element={<ExerciseFormPage />} />
          <Route path="/cwiczenia/:id" element={<ExerciseDetailPage />} />
          <Route path="/historia" element={<HistoryPage />} />
          <Route path="/historia/:id" element={<WorkoutDetailPage />} />
          <Route path="/statystyki" element={<StatsPage />} />
          <Route path="/statystyki/raport" element={<ReportPage />} />
          <Route path="/ustawienia" element={<SettingsPage />} />
          <Route path="/ustawienia/import" element={<ImportPage />} />
          <Route path="/ustawienia/kopia" element={<BackupPage />} />
          <Route path="/trening" element={<WorkoutPage />} />
          <Route path="/trening/podsumowanie/:id" element={<WorkoutSummaryPage />} />
        </Routes>
        </Screen>
      </main>
      <UndoToast />
      <BottomNav />
    </HashRouter>
  );
}
