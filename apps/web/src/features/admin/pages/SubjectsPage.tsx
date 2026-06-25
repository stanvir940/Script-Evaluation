import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SubjectDto } from '@dasems/shared-types';
import { api } from '../../../shared/api/client';
import { AppLayout } from '../../../shared/components/layout/AppLayout';

export function SubjectsPage() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  const { data: subjects, isLoading } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get<SubjectDto[]>('/subjects'),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post<SubjectDto>('/subjects', { code, name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
      setCode('');
      setName('');
    },
  });

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-6">Subjects</h1>

        <form
          className="panel p-4 mb-6 flex flex-wrap gap-4 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <div>
            <label className="block text-sm font-medium mb-1">Code</label>
            <input className="input-field w-32" value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium mb-1">Name</label>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
            Add Subject
          </button>
        </form>

        {isLoading ? (
          <p className="text-text-muted">Loading...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {subjects?.map((s) => (
                <tr key={s.id}>
                  <td>{s.code}</td>
                  <td>{s.name}</td>
                  <td>{s.isActive ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}
