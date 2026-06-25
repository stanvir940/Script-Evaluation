import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAppSelector } from '../app/hooks';
import { AppLayout } from '../shared/components/layout/AppLayout';
import { TeacherDashboard } from '../features/evaluation/pages/EvaluationPage';
import { HeadExaminerDashboard } from '../features/moderation/pages/ModerationPage';
import { DashboardOverviewDto } from '@dasems/shared-types';
import { api } from '../shared/api/client';

function AdminDashboard() {
  const { data: overview } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.get<DashboardOverviewDto>('/results/overview'),
  });

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-6">System Overview</h1>

        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            <div className="stat-box"><p className="stat-label">Students</p><p className="stat-value">{overview.totalStudents}</p></div>
            <div className="stat-box"><p className="stat-label">Answers</p><p className="stat-value">{overview.totalAnswers}</p></div>
            <div className="stat-box"><p className="stat-label">Finalized</p><p className="stat-value text-success">{overview.finalized}</p></div>
            <div className="stat-box"><p className="stat-label">Escalated</p><p className="stat-value text-danger">{overview.escalated}</p></div>
            <div className="stat-box"><p className="stat-label">Moderation</p><p className="stat-value">{overview.pendingModeration}</p></div>
            <div className="stat-box"><p className="stat-label">In Progress</p><p className="stat-value">{overview.inProgress}</p></div>
          </div>
        )}

        <div className="panel p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Administration</h2>
          <div className="flex flex-wrap gap-3">
            <Link to="/admin/sessions" className="btn-secondary">Sessions</Link>
            <Link to="/admin/departments" className="btn-secondary">Departments</Link>
            <Link to="/admin/subjects" className="btn-secondary">Subjects</Link>
            <Link to="/admin/questions" className="btn-secondary">Question Bank</Link>
            <Link to="/admin/students" className="btn-secondary">Students</Link>
            <Link to="/admin/users" className="btn-secondary">Users</Link>
            <Link to="/admin/results" className="btn-secondary">Results & Export</Link>
            <Link to="/admin/audit-logs" className="btn-secondary">Audit Logs</Link>
          </div>
        </div>

        {overview?.subjectBreakdown && (
          <table className="data-table">
            <thead>
              <tr><th>Subject</th><th>Total</th><th>Finalized</th><th>Escalated</th></tr>
            </thead>
            <tbody>
              {overview.subjectBreakdown.map((s) => (
                <tr key={s.subjectCode}>
                  <td>{s.subjectName}</td>
                  <td>{s.total}</td>
                  <td>{s.finalized}</td>
                  <td>{s.escalated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}

export function DashboardPage() {
  const { user } = useAppSelector((s) => s.auth);
  if (user?.role === 'TEACHER') return <TeacherDashboard />;
  if (user?.role === 'HEAD_EXAMINER') return <HeadExaminerDashboard />;
  return <AdminDashboard />;
}
