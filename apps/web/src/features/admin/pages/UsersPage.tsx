import { useQuery } from '@tanstack/react-query';
import { UserDto } from '@dasems/shared-types';
import { api } from '../../../shared/api/client';
import { AppLayout } from '../../../shared/components/layout/AppLayout';

export function UsersPage() {
  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserDto[]>('/users'),
  });

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-6">Users</h1>
        <p className="text-sm text-text-muted mb-4">User creation form will be expanded in Phase 2.</p>

        {isLoading ? (
          <p className="text-text-muted">Loading...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id}>
                  <td>{u.employeeId}</td>
                  <td>{u.name}</td>
                  <td>{u.role.replace(/_/g, ' ')}</td>
                  <td>{u.isActive ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}
