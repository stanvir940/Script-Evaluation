import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { UserRole } from '@dasems/shared-types';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { logout } from '../../../features/auth/authSlice';

interface NavItem {
  label: string;
  path: string;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', roles: ['SUPER_ADMIN', 'HEAD_EXAMINER', 'TEACHER'] },
  { label: 'Evaluate', path: '/evaluate', roles: ['TEACHER'] },
  { label: 'Moderation', path: '/moderation', roles: ['HEAD_EXAMINER', 'SUPER_ADMIN'] },
  { label: 'Sessions', path: '/admin/sessions', roles: ['SUPER_ADMIN'] },
  { label: 'Students', path: '/admin/students', roles: ['SUPER_ADMIN'] },
  { label: 'Question Bank', path: '/admin/questions', roles: ['SUPER_ADMIN'] },
  { label: 'Results', path: '/admin/results', roles: ['SUPER_ADMIN'] },
  { label: 'Users', path: '/admin/users', roles: ['SUPER_ADMIN'] },
  { label: 'Audit Logs', path: '/admin/audit-logs', roles: ['SUPER_ADMIN'] },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAppSelector((s) => s.auth);
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();

  const visibleNav = NAV_ITEMS.filter((item) => user && item.roles.includes(user.role));

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 bg-white border-b border-border flex items-center justify-between px-6 shrink-0">
        <span className="text-lg font-semibold text-primary">DASEMS</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-secondary">{user?.name}</span>
          <button type="button" onClick={handleLogout} className="btn-ghost text-sm">
            Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[200px] bg-white border-r border-border shrink-0 hidden md:block">
          <nav className="py-2">
            {visibleNav.map((item) => {
              const active =
                location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <Link key={item.path} to={item.path} className={active ? 'nav-item-active' : 'nav-item'}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="px-4 py-4 mt-4 border-t border-border text-sm text-text-muted">
            <p>{user?.name}</p>
            <p className="mt-1">{user?.role.replace(/_/g, ' ')}</p>
          </div>
        </aside>

        <main className="flex-1 overflow-auto bg-surface">{children}</main>
      </div>
    </div>
  );
}
