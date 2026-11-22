import { NavLink, useLocation } from 'react-router';
import { Home, CalendarDays, Dumbbell, History, ChartLine } from 'lucide-react';
import './BottomNav.css';

const links = [
  { to: '/',           label: 'Start',      Icon: Home,        end: true  },
  { to: '/plany',      label: 'Plany',      Icon: CalendarDays, end: false },
  { to: '/cwiczenia',  label: 'Ćwiczenia',  Icon: Dumbbell,    end: false },
  { to: '/historia',   label: 'Historia',   Icon: History,     end: false },
  { to: '/statystyki', label: 'Statystyki', Icon: ChartLine,   end: false },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  // The live workout and its summary are full-screen.
  if (pathname.startsWith('/trening')) return null;
  return (
    <nav className="bottom-nav" aria-label="Główne menu">
      {links.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className="bottom-nav__link">
          <span className="bottom-nav__icon">
            <Icon size={22} aria-hidden="true" />
          </span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
