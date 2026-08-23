import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { RequireAuth, RequireAdmin } from './components/RequireAuth';
import { Layout } from './components/Layout';
import { ThisWeek } from './pages/ThisWeek';
import { Standings } from './pages/Standings';
import { PreseasonProjections } from './pages/PreseasonProjections';
import { History } from './pages/History';
import { Account } from './pages/Account';
import { BuildWeek } from './pages/admin/BuildWeek';
import { EnterResults } from './pages/admin/EnterResults';

export default function App() {
  return (
    <AuthProvider>
      <RequireAuth>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<ThisWeek />} />
              <Route path="standings" element={<Standings />} />
              <Route path="preseason" element={<PreseasonProjections />} />
              <Route path="history" element={<History />} />
              <Route path="account" element={<Account />} />
              <Route
                path="admin/build-week"
                element={<RequireAdmin><BuildWeek /></RequireAdmin>}
              />
              <Route
                path="admin/enter-results"
                element={<RequireAdmin><EnterResults /></RequireAdmin>}
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </RequireAuth>
    </AuthProvider>
  );
}
