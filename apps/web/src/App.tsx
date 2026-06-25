import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { HomePage, AdminDashboard } from './pages/DashboardPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { ModerationPage } from './pages/ModerationPage';
import { HistoryPage } from './pages/HistoryPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<HomePage />} />
            </Route>

            <Route element={<ProtectedRoute roles={['TEACHER']} />}>
              <Route path="/evaluate" element={<EvaluationPage />} />
              <Route path="/history" element={<HistoryPage />} />
            </Route>

            <Route element={<ProtectedRoute roles={['HEAD_EXAMINER', 'SUPER_ADMIN']} />}>
              <Route path="/moderation" element={<ModerationPage />} />
            </Route>

            <Route element={<ProtectedRoute roles={['SUPER_ADMIN']} />}>
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
