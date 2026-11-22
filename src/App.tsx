import { HashRouter, Routes, Route } from 'react-router';
import BottomNav from './components/BottomNav';
import StartPage from './pages/StartPage';
import PlansPage from './pages/PlansPage';
import ExercisesPage from './pages/ExercisesPage';
import HistoryPage from './pages/HistoryPage';
import StatsPage from './pages/StatsPage';

export default function App() {
  return (
    <HashRouter>
      <main>
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="/plany" element={<PlansPage />} />
          <Route path="/cwiczenia" element={<ExercisesPage />} />
          <Route path="/historia" element={<HistoryPage />} />
          <Route path="/statystyki" element={<StatsPage />} />
        </Routes>
      </main>
      <BottomNav />
    </HashRouter>
  );
}
