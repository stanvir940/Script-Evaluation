import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdmissionExamDto, AdmissionSessionDto } from "@dasems/shared-types";
import { api } from "../../../shared/api/client";
import { AppLayout } from "../../../shared/components/layout/AppLayout";

export function SessionsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    examId: "",
    name: "",
    sCodePrefix: "KUET-2026",
    moderationThreshold: 3,
  });

  const { data: exams } = useQuery({
    queryKey: ["admission-exams"],
    queryFn: () => api.get<AdmissionExamDto[]>("/admission-exams"),
  });

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.get<AdmissionSessionDto[]>("/sessions"),
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) =>
      api.post<AdmissionSessionDto>("/sessions", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-6">Admission Sessions</h1>

        <form
          className="panel p-4 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate(form);
          }}
        >
          <div>
            <label className="block text-sm font-medium mb-1">Exam</label>
            <select
              className="input-field"
              value={form.examId}
              onChange={(e) => setForm({ ...form, examId: e.target.value })}
              required
            >
              <option value="">Select exam...</option>
              {exams?.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.name} ({exam.year})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Session Name
            </label>
            <input
              className="input-field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              s_code Prefix
            </label>
            <input
              className="input-field"
              value={form.sCodePrefix}
              onChange={(e) =>
                setForm({ ...form, sCodePrefix: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Moderation Threshold
            </label>
            <input
              type="number"
              className="input-field"
              value={form.moderationThreshold}
              onChange={(e) =>
                setForm({
                  ...form,
                  moderationThreshold: Number(e.target.value),
                })
              }
              min={0}
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="btn-primary"
              disabled={createMutation.isPending}
            >
              Create Session
            </button>
          </div>
        </form>

        {isLoading ? (
          <p className="text-text-muted">Loading...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Status</th>
                <th>s_code Prefix</th>
                <th>Threshold</th>
              </tr>
            </thead>
            <tbody>
              {sessions?.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs break-all">{s.id}</td>
                  <td>{s.name}</td>
                  <td>{s.status}</td>
                  <td>{s.sCodePrefix}</td>
                  <td>{s.moderationThreshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}
