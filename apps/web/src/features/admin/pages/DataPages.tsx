import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QuestionDto, StudentAdminDto } from '@dasems/shared-types';
import { api } from '../../../shared/api/client';
import { AppLayout } from '../../../shared/components/layout/AppLayout';

export function QuestionsPage() {
  const [sessionId, setSessionId] = useState('');
  const { data: questions } = useQuery({
    queryKey: ['questions', sessionId],
    queryFn: () => api.get<QuestionDto[]>(`/questions?sessionId=${sessionId}`),
    enabled: Boolean(sessionId),
  });

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-6">Question Bank</h1>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Session ID</label>
          <input className="input-field max-w-md" value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="Paste session ID from seed output" />
        </div>
        {questions && (
          <table className="data-table">
            <thead>
              <tr><th>Q#</th><th>Text</th><th>Marks</th><th>Difficulty</th></tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.id}>
                  <td>{q.questionNumber}</td>
                  <td className="max-w-md truncate">{q.text}</td>
                  <td>{q.maxMarks}</td>
                  <td>{q.difficulty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}

export function StudentsPage() {
  const [sessionId, setSessionId] = useState('');
  const { data: students } = useQuery({
    queryKey: ['students', sessionId],
    queryFn: () => api.get<StudentAdminDto[]>(`/students?sessionId=${sessionId}`),
    enabled: Boolean(sessionId),
  });

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-6">Students (Admin — contains PII)</h1>
        <p className="text-sm text-text-muted mb-4">Teachers never see roll, name, or department. They only see s_code.</p>
        <div className="mb-4">
          <input className="input-field max-w-md" value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="Session ID" />
        </div>
        {students && (
          <table className="data-table">
            <thead>
              <tr><th>Roll</th><th>Name</th><th>s_code</th><th>Status</th></tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>{s.roll}</td>
                  <td>{s.name}</td>
                  <td>{s.sCode}</td>
                  <td>{s.processingStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}

export function ResultsPage() {
  const [sessionId, setSessionId] = useState('');

  const exportCsv = () => {
    window.open(`/api/v1/results/export/csv?sessionId=${sessionId}`, '_blank');
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl">
        <h1 className="text-xl font-semibold mb-6">Results & Export</h1>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Session ID</label>
          <input className="input-field" value={sessionId} onChange={(e) => setSessionId(e.target.value)} />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={exportCsv} className="btn-primary" disabled={!sessionId}>Export CSV</button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!sessionId}
            onClick={() => api.post('/results/publish', { sessionId })}
          >
            Publish Results
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
