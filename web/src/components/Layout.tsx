import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useTheme } from '../hooks/useTheme';

export function Layout() {
  const { player, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <span className="brand">Diehards</span>
          <nav>
            <NavLink to="/" end>This Week</NavLink>
            <NavLink to="/standings">Standings</NavLink>
            <NavLink to="/preseason">Preseason</NavLink>
            <NavLink to="/history">History</NavLink>
            {isAdmin && <NavLink to="/admin/build-week">Build Week</NavLink>}
            {isAdmin && <NavLink to="/admin/enter-results">Enter Results</NavLink>}
          </nav>
          <button type="button" className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <div className="header-user">
            <span>{player?.display_name}</span>
            <NavLink to="/account">Account</NavLink>
            <button className="link-button" onClick={() => supabase.auth.signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
