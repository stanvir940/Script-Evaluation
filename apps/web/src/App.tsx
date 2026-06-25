import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProviders } from './app/providers';
import { ProtectedRoute } from './shared/components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { SessionsPage } from './features/admin/pages/SessionsPage';
import { DepartmentsPage } from './features/admin/pages/DepartmentsPage';
import { SubjectsPage } from './features/admin/pages/SubjectsPage';
import { UsersPage } from './features/admin/pages/UsersPage';
import { AuditLogsPage } from './features/admin/pages/AuditLogsPage';
import { QuestionsPage, StudentsPage, ResultsPage } from './features/admin/pages/DataPages';
import { EvaluationPage } from './features/evaluation/pages/EvaluationPage';
import { ModerationPage } from './features/moderation/pages/ModerationPage';

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['TEACHER']} />}>
            <Route path="/evaluate" element={<EvaluationPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['HEAD_EXAMINER', 'SUPER_ADMIN']} />}>
            <Route path="/moderation" element={<ModerationPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['SUPER_ADMIN']} />}>
            <Route path="/admin/sessions" element={<SessionsPage />} />
            <Route path="/admin/departments" element={<DepartmentsPage />} />
            <Route path="/admin/subjects" element={<SubjectsPage />} />
            <Route path="/admin/questions" element={<QuestionsPage />} />
            <Route path="/admin/students" element={<StudentsPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/results" element={<ResultsPage />} />
            <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProviders>
  );
}
