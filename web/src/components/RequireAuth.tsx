import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Login } from '../pages/Login';
import { SetPassword } from '../pages/SetPassword';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, passwordRecovery, clearPasswordRecovery } = useAuth();

  if (passwordRecovery) {
    return <SetPassword title="Set your password" onDone={clearPasswordRecovery} />;
  }
  if (!session) return <Login />;
  if (loading) return <p className="centered">Loading...</p>;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <p className="centered">Admins only.</p>;
  return <>{children}</>;
}
