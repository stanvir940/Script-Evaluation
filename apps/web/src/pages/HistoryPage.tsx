import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { AppLayout } from '../components/layout/AppLayout';

export function HistoryPage() {
  const { data: history, isLoading } = useQuery({
    queryKey: ['evaluation-history'],
    queryFn: () => api.get('/evaluations/history').then((r) => r.data),
  });

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-xl font-semibold text-text-primary mb-6">My Evaluation History</h1>

        {isLoading ? (
          <p className="text-text-muted">Loading...</p>
        ) : Array.isArray(history) && history.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Mark</th>
                <th>Comment</th>
                <th>Submitted At</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item: { id: string; mark: number; comment: string; submittedAt: string }) => (
                <tr key={item.id}>
                  <td>{item.mark}</td>
                  <td>{item.comment || '—'}</td>
                  <td>{new Date(item.submittedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-text-secondary">No evaluations submitted yet.</p>
        )}
      </div>
    </AppLayout>
  );
}
