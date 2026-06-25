import { Navigate, Outlet } from 'react-router-dom';
import { UserRole } from '@dasems/shared-types';
import { useAppSelector } from '../../app/hooks';

export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { user, initialized, loading } = useAppSelector((s) => s.auth);

  if (!initialized || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface">
        <p className="text-text-secondary text-lg">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
