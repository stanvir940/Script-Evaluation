import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TeacherStats } from '@ase/shared-types';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { AppLayout } from '../components/layout/AppLayout';
import { StatRow, StatBox } from '../components/ui/ProgressBar';

export function TeacherDashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading } = useQuery({
    queryKey: ['teacher-stats'],
    queryFn: () => api.get<TeacherStats>('/evaluations/stats').then((r) => r.data!),
  });

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl">
        <h1 className="text-xl font-semibold text-text-primary mb-1">My Dashboard</h1>
        <p className="text-base text-text-secondary mb-6">
          Welcome, {user?.name} · Admission Test 2026
        </p>

        {isLoading ? (
          <p className="text-text-muted">Loading statistics...</p>
        ) : stats ? (
          <>
            <StatRow>
              <StatBox label="Assigned" value={stats.assigned} />
              <StatBox label="Completed" value={stats.completed} variant="success" />
              <StatBox label="Remaining" value={stats.remaining} />
            </StatRow>

            <div className="mt-8">
              <Link to="/evaluate" className="btn-primary text-lg px-8 py-3 inline-flex">
                Start Evaluation
              </Link>
            </div>

            <div className="mt-8 panel p-4">
              <h2 className="text-lg font-semibold text-text-primary mb-3">Today&apos;s Progress</h2>
              <p className="text-base text-text-secondary">
                Evaluated today: <strong className="text-text-primary">{stats.evaluatedToday}</strong>
              </p>
            </div>
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}

export function HeadExaminerDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['adjudication-stats'],
    queryFn: () =>
      api.get<{ pending: number; completed: number }>('/adjudications/stats').then((r) => r.data!),
  });

  const { data: overview } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.get('/dashboard/overview').then((r) => r.data),
  });

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl">
        <h1 className="text-xl font-semibold text-text-primary mb-6">Moderation Dashboard</h1>

        {isLoading ? (
          <p className="text-text-muted">Loading...</p>
        ) : stats ? (
          <>
            <StatRow>
              <StatBox label="Pending" value={stats.pending} variant="danger" />
              <StatBox label="Completed" value={stats.completed} variant="success" />
              <StatBox
                label="Escalation Rate"
                value={
                  overview && typeof overview === 'object' && 'totalAnswers' in overview
                    ? `${(((overview as { escalated: number; totalAnswers: number }).escalated / Math.max((overview as { totalAnswers: number }).totalAnswers, 1)) * 100).toFixed(1)}%`
                    : '—'
                }
              />
            </StatRow>

            <div className="mt-8">
              <Link to="/moderation" className="btn-primary text-lg px-8 py-3 inline-flex">
                Open Moderation Queue
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}

export function AdminDashboard() {
  const { data: overview, isLoading } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.get('/dashboard/overview').then((r) => r.data),
  });

  const { data: subjects } = useQuery({
    queryKey: ['dashboard-subjects'],
    queryFn: () => api.get('/dashboard/subjects').then((r) => r.data),
  });

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-xl font-semibold text-text-primary mb-6">
          System Overview — Admission Test 2026
        </h1>

        {isLoading ? (
          <p className="text-text-muted">Loading...</p>
        ) : overview && typeof overview === 'object' ? (
          <>
            <StatRow>
              <StatBox label="Total Answers" value={(overview as { totalAnswers: number }).totalAnswers} />
              <StatBox label="Finalized" value={(overview as { finalized: number }).finalized} variant="success" />
              <StatBox label="Escalated" value={(overview as { escalated: number }).escalated} variant="danger" />
            </StatRow>

            {Array.isArray(subjects) && subjects.length > 0 && (
              <div className="mt-8 overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Total</th>
                      <th>Finalized</th>
                      <th>Escalated</th>
                      <th>Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((s: { id: string; name: string; total: number; finalized: number; escalated: number; pending: number }) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.total}</td>
                        <td>{s.finalized}</td>
                        <td>{s.escalated}</td>
                        <td>{s.pending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}

export function HomePage() {
  const { user } = useAuth();

  if (user?.role === 'TEACHER') return <TeacherDashboard />;
  if (user?.role === 'HEAD_EXAMINER') return <HeadExaminerDashboard />;
  if (user?.role === 'SUPER_ADMIN') return <AdminDashboard />;

  return null;
}
