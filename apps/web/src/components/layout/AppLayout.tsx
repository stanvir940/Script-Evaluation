import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '@ase/shared-types';

interface NavItem {
  label: string;
  path: string;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'My Dashboard', path: '/', roles: ['TEACHER', 'HEAD_EXAMINER', 'SUPER_ADMIN'] },
  { label: 'Evaluate Answers', path: '/evaluate', roles: ['TEACHER'] },
  { label: 'My History', path: '/history', roles: ['TEACHER'] },
  { label: 'Moderation Queue', path: '/moderation', roles: ['HEAD_EXAMINER', 'SUPER_ADMIN'] },
  { label: 'System Overview', path: '/admin', roles: ['SUPER_ADMIN'] },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isEvaluationMode = location.pathname.startsWith('/evaluate') || location.pathname.startsWith('/moderation');
  const visibleNav = NAV_ITEMS.filter((item) => user && item.roles.includes(user.role));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 bg-white border-b border-border flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          {!isEvaluationMode && (
            <span className="text-lg font-semibold text-primary">Admission Script Evaluation</span>
          )}
          {isEvaluationMode && (
            <span className="text-base text-text-secondary">Admission Test 2026</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-secondary">{user?.name}</span>
          <button type="button" onClick={handleLogout} className="btn-ghost text-sm">
            Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {!isEvaluationMode && (
          <aside className="w-[200px] bg-white border-r border-border shrink-0 hidden md:block">
            <nav className="py-2">
              {visibleNav.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={
                    location.pathname === item.path ||
                    (item.path !== '/' && location.pathname.startsWith(item.path))
                      ? 'nav-item-active'
                      : 'nav-item'
                  }
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="px-4 py-4 mt-4 border-t border-border text-sm text-text-muted">
              <p>{user?.name}</p>
              <p className="mt-1">{user?.role.replace('_', ' ')}</p>
            </div>
          </aside>
        )}

        <main className="flex-1 overflow-auto bg-surface">{children}</main>
      </div>
    </div>
  );
}
