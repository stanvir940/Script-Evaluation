import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdmissionExamDto, AdmissionSessionDto } from "@dasems/shared-types";
import { api } from "../../../shared/api/client";
import { AppLayout } from "../../../shared/components/layout/AppLayout";

// ─── Local types for the mobile-assign panel ────────────────────────────────
// (Matches what GET /students and GET /students/mobile-scripts return in
// student.routes.ts — not imported from shared-types since those routes
// return plain shapes rather than a shared DTO.)
interface StudentRow {
  id: string;
  sessionId: string;
  roll: string;
  name: string;
  faculty: string;
  departmentId: string;
  sCode: string;
  processingStatus: string;
  scriptId?: string;
  scriptStatus?: string;
  scriptUrl?: string;
}

interface MobileScriptRow {
  id: string;
  roll_number: string;
  exam_name: string;
  // Mobile app is PDF-only now — no more "images" capture flow — but we
  // keep this as `string` rather than a literal union so old rows from
  // before that change (if any) don't break type-checking here.
  file_type: string;
  file_paths: string[];
  file_urls: string[];
  status: string;
  created_at: string;
}

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
          <table className="data-table mb-10">
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

        {/* <MobileScriptAssignPanel sessions={sessions ?? []} /> */}
      </div>
    </AppLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MOBILE SCRIPT ASSIGN PANEL
//  Lists roll+PDF submissions from the mobile app (Supabase-backed) and lets
//  the admin match each one to a student in a chosen session, then assign it.
// ─────────────────────────────────────────────────────────────────────────────
// function MobileScriptAssignPanel({
//   sessions,
// }: {
//   sessions: AdmissionSessionDto[];
// }) {
//   const queryClient = useQueryClient();
//   const [sessionId, setSessionId] = useState("");
//   // Per-row manual override: mobileScriptId -> studentId
//   const [overrides, setOverrides] = useState<Record<string, string>>({});

//   const { data: students } = useQuery({
//     queryKey: ["students", sessionId],
//     queryFn: () => api.get<StudentRow[]>(`/students?sessionId=${sessionId}`),
//     enabled: !!sessionId,
//   });

//   const { data: mobileScripts, isLoading: loadingMobile } = useQuery({
//     queryKey: ["mobile-scripts"],
//     queryFn: () =>
//       api.get<MobileScriptRow[]>("/students/mobile-scripts?status=pending"),
//     // Pending uploads can arrive at any time from the mobile app, so poll.
//     refetchInterval: 15000,
//   });

//   const assignMutation = useMutation({
//     mutationFn: ({
//       studentId,
//       mobileScriptId,
//     }: {
//       studentId: string;
//       mobileScriptId: string;
//     }) =>
//       api.post(`/students/${studentId}/assign-mobile-script`, {
//         mobileScriptId,
//       }),
//     onSuccess: () => {
//       queryClient.invalidateQueries({ queryKey: ["mobile-scripts"] });
//       queryClient.invalidateQueries({ queryKey: ["students", sessionId] });
//     },
//   });

//   const discardMutation = useMutation({
//     mutationFn: (mobileScriptId: string) =>
//       api.delete(`/students/mobile-scripts/${mobileScriptId}`),
//     onSuccess: () =>
//       queryClient.invalidateQueries({ queryKey: ["mobile-scripts"] }),
//   });

//   // Auto-match each pending upload to a student in the selected session by
//   // roll number (case/whitespace-insensitive). Falls back to the admin's
//   // manual dropdown pick stored in `overrides`.
//   const matchedStudentIdFor = useMemo(() => {
//     const byRoll = new Map<string, StudentRow>();
//     (students ?? []).forEach((st) =>
//       byRoll.set(st.roll.trim().toUpperCase(), st),
//     );
//     return (row: MobileScriptRow): string => {
//       if (overrides[row.id]) return overrides[row.id];
//       const match = byRoll.get(row.roll_number.trim().toUpperCase());
//       return match?.id ?? "";
//     };
//   }, [students, overrides]);

//   return (
//     <div className="panel p-4">
//       <div className="flex items-center justify-between mb-4">
//         <h2 className="text-lg font-semibold">
//           Mobile Uploads — Assign to Student
//         </h2>
//         <div className="w-64">
//           <select
//             className="input-field"
//             value={sessionId}
//             onChange={(e) => setSessionId(e.target.value)}
//           >
//             <option value="">Select session to match against...</option>
//             {sessions.map((s) => (
//               <option key={s.id} value={s.id}>
//                 {s.name}
//               </option>
//             ))}
//           </select>
//         </div>
//       </div>

//       {!sessionId && (
//         <p className="text-text-muted text-sm">
//           Pick a session above so uploaded roll numbers can be matched to its
//           students.
//         </p>
//       )}

//       {loadingMobile ? (
//         <p className="text-text-muted">Loading mobile uploads...</p>
//       ) : mobileScripts && mobileScripts.length > 0 ? (
//         <table className="data-table">
//           <thead>
//             <tr>
//               <th>Roll</th>
//               <th>Exam</th>
//               <th>Submitted</th>
//               <th>PDF</th>
//               <th>Match student</th>
//               <th>Actions</th>
//             </tr>
//           </thead>
//           <tbody>
//             {mobileScripts.map((row) => {
//               const matchedId = matchedStudentIdFor(row);
//               const isAssigning =
//                 assignMutation.isPending &&
//                 assignMutation.variables?.mobileScriptId === row.id;
//               const isDiscarding =
//                 discardMutation.isPending &&
//                 discardMutation.variables === row.id;
//               const pdfUrl = row.file_urls[0];

//               return (
//                 <tr key={row.id}>
//                   <td className="font-mono">{row.roll_number}</td>
//                   <td>{row.exam_name}</td>
//                   <td className="text-xs text-text-muted">
//                     {new Date(row.created_at).toLocaleString()}
//                   </td>
//                   <td>
//                     {pdfUrl ? (
//                       <a
//                         href={pdfUrl}
//                         target="_blank"
//                         rel="noreferrer"
//                         className="text-accent underline text-sm"
//                       >
//                         View PDF
//                       </a>
//                     ) : (
//                       <span className="text-xs text-danger">
//                         No file attached
//                       </span>
//                     )}
//                   </td>
//                   <td>
//                     <select
//                       className="input-field"
//                       value={matchedId}
//                       disabled={!sessionId}
//                       onChange={(e) =>
//                         setOverrides((prev) => ({
//                           ...prev,
//                           [row.id]: e.target.value,
//                         }))
//                       }
//                     >
//                       <option value="">
//                         {sessionId
//                           ? "Select student..."
//                           : "Pick a session first"}
//                       </option>
//                       {students?.map((st) => (
//                         <option key={st.id} value={st.id}>
//                           {st.roll} — {st.name}
//                         </option>
//                       ))}
//                     </select>
//                     {matchedId && !overrides[row.id] && (
//                       <span className="text-xs text-success ml-1">
//                         auto-matched
//                       </span>
//                     )}
//                   </td>
//                   <td className="whitespace-nowrap">
//                     <button
//                       className="btn-primary mr-2"
//                       disabled={!matchedId || !pdfUrl || isAssigning}
//                       onClick={() =>
//                         assignMutation.mutate({
//                           studentId: matchedId,
//                           mobileScriptId: row.id,
//                         })
//                       }
//                     >
//                       {isAssigning ? "Assigning..." : "Assign"}
//                     </button>
//                     <button
//                       className="btn-secondary"
//                       disabled={isDiscarding}
//                       onClick={() => {
//                         if (
//                           confirm(
//                             `Discard the upload for roll ${row.roll_number}? This deletes the file.`,
//                           )
//                         ) {
//                           discardMutation.mutate(row.id);
//                         }
//                       }}
//                     >
//                       {isDiscarding ? "Discarding..." : "Discard"}
//                     </button>
//                   </td>
//                 </tr>
//               );
//             })}
//           </tbody>
//         </table>
//       ) : (
//         <p className="text-text-muted text-sm">No pending mobile uploads.</p>
//       )}
//     </div>
//   );
// }
