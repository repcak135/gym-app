import { useEffect } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router';
import BottomNav from './components/BottomNav';
import StartPage from './pages/StartPage';
import PlansPage from './pages/PlansPage';
import PlanDetailPage from './pages/PlanDetailPage';
import PlanDayPage from './pages/PlanDayPage';
import ExercisesPage from './pages/ExercisesPage';
import ExerciseDetailPage from './pages/ExerciseDetailPage';
import ExerciseFormPage from './pages/ExerciseFormPage';
import HistoryPage from './pages/HistoryPage';
import StatsPage from './pages/StatsPage';
import SettingsPage from './pages/SettingsPage';

// Each new screen starts at the top (the page scroll would otherwise carry over).
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <ScrollToTop />
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
          <Route path="/statystyki" element={<StatsPage />} />
          <Route path="/ustawienia" element={<SettingsPage />} />
        </Routes>
      </main>
      <BottomNav />
    </HashRouter>
  );
}
