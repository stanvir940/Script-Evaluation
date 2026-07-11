import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AdmissionSessionDto,
  DepartmentDto,
  QuestionDto,
  StudentAdminDto,
} from "@dasems/shared-types";
import { api } from "../../../shared/api/client";
import { AppLayout } from "../../../shared/components/layout/AppLayout";

interface StudentUploadRow {
  roll: string;
  name: string;
  faculty: string;
  departmentId: string;
}

interface MeritRow {
  roll: string;
  name: string;
  sCode: string;
  totalObtained: number;
  totalPossible: number;
  percentage: number;
}

interface ParsedStudentRow extends StudentUploadRow {
  rowNumber: number;
}

// Matches what GET /students/mobile-scripts returns in student.routes.ts —
// a plain Supabase row shape, not a shared DTO.
interface MobileScriptRow {
  id: string;
  roll_number: string;
  exam_name: string;
  file_type: string;
  file_paths: string[];
  file_urls: string[];
  status: string;
  created_at: string;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseStudentCsv(
  text: string,
  defaultDepartmentId: string,
  departments: DepartmentDto[],
): { rows: ParsedStudentRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2)
    return {
      rows: [],
      errors: ["CSV must include a header and at least one student row."],
    };

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const indexOf = (name: string) => headers.indexOf(name);
  const rollIndex = indexOf("roll");
  const nameIndex = indexOf("name");
  const facultyIndex = indexOf("faculty");
  const departmentIdIndex = indexOf("departmentid");
  const departmentCodeIndex = indexOf("departmentcode");
  const errors: string[] = [];
  const rows: ParsedStudentRow[] = [];
  const departmentByCode = new Map(
    departments.map((d) => [d.code.toUpperCase(), d.id]),
  );

  if (rollIndex === -1 || nameIndex === -1 || facultyIndex === -1) {
    return { rows: [], errors: ["Required headers: roll,name,faculty."] };
  }

  lines.slice(1).forEach((line, idx) => {
    const values = parseCsvLine(line);
    const rowNumber = idx + 2;
    const roll = values[rollIndex]?.trim() ?? "";
    const name = values[nameIndex]?.trim() ?? "";
    const faculty = values[facultyIndex]?.trim() ?? "";
    const departmentCode =
      values[departmentCodeIndex]?.trim().toUpperCase() ?? "";
    const departmentId =
      values[departmentIdIndex]?.trim() ||
      departmentByCode.get(departmentCode) ||
      defaultDepartmentId;

    if (!roll || !name || !faculty || !departmentId) {
      errors.push(
        `Row ${rowNumber}: roll, name, faculty, and department are required.`,
      );
      return;
    }

    rows.push({ rowNumber, roll, name, faculty, departmentId });
  });

  return { rows, errors };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

export function QuestionsPage() {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState("");
  const [bulkPayload, setBulkPayload] = useState("");
  const { data: sessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.get<AdmissionSessionDto[]>("/sessions"),
  });
  const { data: questions } = useQuery({
    queryKey: ["questions", sessionId],
    queryFn: () => api.get<QuestionDto[]>(`/questions?sessionId=${sessionId}`),
    enabled: Boolean(sessionId),
  });

  const bulkImportMutation = useMutation({
    mutationFn: (body: {
      sessionId: string;
      questions: Array<Record<string, unknown>>;
    }) => api.post("/questions/bulk", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions", sessionId] });
      setBulkPayload("");
    },
  });

  const handleBulkImport = () => {
    if (!sessionId) return;
    try {
      const parsed = JSON.parse(bulkPayload);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Provide a JSON array of question objects.");
      }
      bulkImportMutation.mutate({ sessionId, questions: parsed });
    } catch {
      window.alert("Please enter a valid JSON array of question objects.");
    }
  };

  const loadSampleJson = async () => {
    try {
      const response = await fetch("/question-bank2.json");
      if (!response.ok) throw new Error("Could not load sample JSON");
      const data = await response.json();
      setBulkPayload(JSON.stringify(data, null, 2));
    } catch (err) {
      window.alert(
        err instanceof Error
          ? err.message
          : "Failed to load sample question JSON.",
      );
    }
  };

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-6">Question Bank</h1>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Session</label>
          <select
            className="input-field max-w-md"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            <option value="">Select session...</option>
            {sessions?.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name} — {session.sCodePrefix} ({session.status})
              </option>
            ))}
          </select>
          <p className="text-sm text-text-muted mt-2">
            Select a session to import the question bank. Session IDs are shown
            in the admission session list.
          </p>
        </div>
        <div className="panel p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2">Upload Solution Pack</h2>
          <p className="text-sm text-text-muted mb-3">
            Paste a JSON array containing all questions with model answers and
            rubrics. This updates the question bank for the selected session.
          </p>
          <textarea
            className="input-field min-h-[220px] font-mono text-sm"
            value={bulkPayload}
            onChange={(e) => setBulkPayload(e.target.value)}
            placeholder='[{"questionNumber":1,"text":"Question 1","maxMarks":10,"modelAnswer":"...","rubric":"...","keywords":[],"difficulty":"MEDIUM"}]'
          />
          <div className="flex flex-wrap gap-3 mt-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={loadSampleJson}
            >
              Load Sample JSON
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleBulkImport}
              disabled={!sessionId || bulkImportMutation.isPending}
            >
              {bulkImportMutation.isPending
                ? "Importing..."
                : "Import Solutions"}
            </button>
          </div>
        </div>
        {questions && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Q#</th>
                <th>Text</th>
                <th>Marks</th>
                <th>Difficulty</th>
              </tr>
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
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedStudentRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [uploadingStudentId, setUploadingStudentId] = useState<string | null>(
    null,
  );
  const [singleStudentForm, setSingleStudentForm] = useState({
    roll: "",
    name: "",
    faculty: "",
  });
  // Per-row manual override for mobile-upload matching: mobileScriptId -> studentId
  const [mobileOverrides, setMobileOverrides] = useState<
    Record<string, string>
  >({});

  const { data: sessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.get<AdmissionSessionDto[]>("/sessions"),
    refetchInterval: 5000,
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<DepartmentDto[]>("/departments"),
    refetchInterval: 5000,
  });

  const { data: students } = useQuery({
    queryKey: ["students", sessionId],
    queryFn: () =>
      api.get<StudentAdminDto[]>(`/students?sessionId=${sessionId}`),
    enabled: Boolean(sessionId),
    refetchInterval: 5000,
  });

  // ── Mobile uploads pending assignment ───────────────────────────────────
  const {
    data: mobileScripts,
    isLoading: loadingMobile,
    isError: mobileError,
    error: mobileErrorDetail,
  } = useQuery({
    queryKey: ["mobile-scripts"],
    queryFn: () =>
      api.get<MobileScriptRow[]>("/students/mobile-scripts?status=pending"),
    // Pending uploads can arrive at any time from the mobile app, so poll.
    refetchInterval: 15000,
  });

  const assignMobileMutation = useMutation({
    mutationFn: ({
      studentId,
      mobileScriptId,
    }: {
      studentId: string;
      mobileScriptId: string;
    }) =>
      api.post(`/students/${studentId}/assign-mobile-script`, {
        mobileScriptId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-scripts"] });
      queryClient.invalidateQueries({ queryKey: ["students", sessionId] });
    },
  });

  const discardMobileMutation = useMutation({
    mutationFn: (mobileScriptId: string) =>
      api.delete(`/students/mobile-scripts/${mobileScriptId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["mobile-scripts"] }),
  });

  // Auto-match each pending upload to a student in the currently selected
  // session by roll number (case/whitespace-insensitive). Falls back to the
  // admin's manual dropdown pick stored in `mobileOverrides`.
  const matchedStudentIdFor = useMemo(() => {
    const byRoll = new Map<string, StudentAdminDto>();
    (students ?? []).forEach((st) =>
      byRoll.set(st.roll.trim().toUpperCase(), st),
    );
    return (row: MobileScriptRow): string => {
      if (mobileOverrides[row.id]) return mobileOverrides[row.id];
      const match = byRoll.get(row.roll_number.trim().toUpperCase());
      return match?.id ?? "";
    };
  }, [students, mobileOverrides]);

  const uploadMutation = useMutation({
    mutationFn: (rows: StudentUploadRow[]) =>
      api.post<Array<{ id: string; roll: string; sCode: string }>>(
        "/students/bulk",
        {
          sessionId,
          students: rows,
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students", sessionId] });
      setParsedRows([]);
      setParseErrors([]);
    },
  });

  const singleStudentMutation = useMutation({
    mutationFn: (data: {
      sessionId: string;
      roll: string;
      name: string;
      faculty: string;
    }) => api.post("/students", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students", sessionId] });
      setSingleStudentForm({ roll: "", name: "", faculty: "" });
    },
  });

  const pdfUploadMutation = useMutation({
    mutationFn: async ({
      studentId,
      file,
    }: {
      studentId: string;
      file: File;
    }) => {
      const pdfBase64 = await fileToBase64(file);
      return api.post<{ scriptId: string; status: string }>(
        `/students/${studentId}/upload-pdf`,
        {
          pdfBase64,
          filename: file.name,
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students", sessionId] });
      setUploadingStudentId(null);
    },
    onError: () => setUploadingStudentId(null),
  });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const result = parseStudentCsv(text, departmentId, departments ?? []);
    setParsedRows(result.rows);
    setParseErrors(result.errors);
  };

  const submitUpload = () => {
    uploadMutation.mutate(
      parsedRows.map(({ rowNumber: _rowNumber, ...row }) => row),
    );
  };

  const handlePdfUpload = (studentId: string, file: File | undefined) => {
    if (!file) return;
    setUploadingStudentId(studentId);
    pdfUploadMutation.mutate({ studentId, file });
  };

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-6">
          Students (Admin — contains PII)
        </h1>
        <p className="text-sm text-text-muted mb-4">
          Teachers never see roll, name, or department. They only see s_code.
        </p>

        <div className="panel p-4 mb-6">
          <h2 className="text-lg font-semibold mb-4">Create Single Student</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">Session</label>
              <select
                className="input-field"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
              >
                <option value="">Select session...</option>
                {sessions?.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Roll</label>
              <input
                className="input-field"
                value={singleStudentForm.roll}
                onChange={(e) =>
                  setSingleStudentForm({
                    ...singleStudentForm,
                    roll: e.target.value,
                  })
                }
                placeholder="Roll number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                className="input-field"
                value={singleStudentForm.name}
                onChange={(e) =>
                  setSingleStudentForm({
                    ...singleStudentForm,
                    name: e.target.value,
                  })
                }
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Faculty</label>
              <input
                className="input-field"
                value={singleStudentForm.faculty}
                onChange={(e) =>
                  setSingleStudentForm({
                    ...singleStudentForm,
                    faculty: e.target.value,
                  })
                }
                placeholder="Faculty"
              />
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={
                !sessionId ||
                !singleStudentForm.roll ||
                !singleStudentForm.name ||
                !singleStudentForm.faculty ||
                singleStudentMutation.isPending
              }
              onClick={() =>
                singleStudentMutation.mutate({
                  sessionId,
                  roll: singleStudentForm.roll,
                  name: singleStudentForm.name,
                  faculty: singleStudentForm.faculty,
                })
              }
            >
              {singleStudentMutation.isPending ? "Adding..." : "Add Student"}
            </button>
          </div>
          {singleStudentMutation.error && (
            <p className="text-danger text-sm mt-2">
              {singleStudentMutation.error.message}
            </p>
          )}
        </div>

        <div className="panel p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">
              Session (Bulk)
            </label>
            <select
              className="input-field"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
            >
              <option value="">Select session...</option>
              {sessions?.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Default Department
            </label>
            <select
              className="input-field"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">Select department...</option>
              {departments?.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.code} — {department.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">CSV File</label>
            <input
              type="file"
              accept=".csv,text/csv"
              className="input-field py-2"
              disabled={!sessionId || !departmentId}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        </div>

        {parseErrors.length > 0 && (
          <div className="bg-danger-bg text-danger border border-danger/20 px-4 py-3 mb-4 text-sm">
            {parseErrors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}

        {parsedRows.length > 0 && (
          <div className="panel p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Upload Preview</h2>
              <button
                type="button"
                className="btn-primary"
                disabled={uploadMutation.isPending || parseErrors.length > 0}
                onClick={submitUpload}
              >
                {uploadMutation.isPending
                  ? "Uploading..."
                  : `Upload ${parsedRows.length} Students`}
              </button>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Roll</th>
                  <th>Name</th>
                  <th>Faculty</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 10).map((row) => (
                  <tr key={`${row.rowNumber}-${row.roll}`}>
                    <td>{row.rowNumber}</td>
                    <td>{row.roll}</td>
                    <td>{row.name}</td>
                    <td>{row.faculty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {uploadMutation.error && (
          <div className="bg-danger-bg text-danger border border-danger/20 px-4 py-3 mb-4 text-sm">
            {uploadMutation.error.message}
          </div>
        )}

        {/* ── Mobile Uploads — Assign to Student ── */}
        <div className="panel p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Mobile Uploads — Assign to Student
            </h2>
          </div>

          {!sessionId && (
            <p className="text-text-muted text-sm mb-3">
              Select a session above (Create Single Student or Bulk section) so
              uploaded roll numbers can be matched to its students.
            </p>
          )}

          {loadingMobile ? (
            <p className="text-text-muted">Loading mobile uploads...</p>
          ) : mobileError ? (
            <div className="bg-danger-bg text-danger border border-danger/20 px-4 py-3 text-sm">
              Could not load mobile uploads
              {mobileErrorDetail instanceof Error
                ? `: ${mobileErrorDetail.message}`
                : "."}{" "}
              This is usually an authentication issue (expired session) rather
              than missing data — try refreshing or signing in again.
            </div>
          ) : mobileScripts && mobileScripts.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Roll</th>
                  <th>Exam</th>
                  <th>Submitted</th>
                  <th>PDF</th>
                  <th>Match student</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mobileScripts.map((row) => {
                  const matchedId = matchedStudentIdFor(row);
                  const isAssigning =
                    assignMobileMutation.isPending &&
                    assignMobileMutation.variables?.mobileScriptId === row.id;
                  const isDiscarding =
                    discardMobileMutation.isPending &&
                    discardMobileMutation.variables === row.id;
                  const pdfUrl = row.file_urls[0];

                  return (
                    <tr key={row.id}>
                      <td className="font-mono">{row.roll_number}</td>
                      <td>{row.exam_name}</td>
                      <td className="text-xs text-text-muted">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td>
                        {pdfUrl ? (
                          <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline text-sm"
                          >
                            View PDF
                          </a>
                        ) : (
                          <span className="text-xs text-danger">
                            No file attached
                          </span>
                        )}
                      </td>
                      <td>
                        <select
                          className="input-field"
                          value={matchedId}
                          disabled={!sessionId}
                          onChange={(e) =>
                            setMobileOverrides((prev) => ({
                              ...prev,
                              [row.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">
                            {sessionId
                              ? "Select student..."
                              : "Pick a session first"}
                          </option>
                          {students?.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.roll} — {st.name}
                            </option>
                          ))}
                        </select>
                        {matchedId && !mobileOverrides[row.id] && (
                          <span className="text-xs text-success ml-1">
                            auto-matched
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <button
                          className="btn-primary mr-2"
                          disabled={!matchedId || !pdfUrl || isAssigning}
                          onClick={() =>
                            assignMobileMutation.mutate({
                              studentId: matchedId,
                              mobileScriptId: row.id,
                            })
                          }
                        >
                          {isAssigning ? "Assigning..." : "Assign"}
                        </button>
                        <button
                          className="btn-secondary"
                          disabled={isDiscarding}
                          onClick={() => {
                            if (
                              confirm(
                                `Discard the upload for roll ${row.roll_number}? This deletes the file.`,
                              )
                            ) {
                              discardMobileMutation.mutate(row.id);
                            }
                          }}
                        >
                          {isDiscarding ? "Discarding..." : "Discard"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-text-muted text-sm">
              No pending mobile uploads.
            </p>
          )}
        </div>

        <div className="mb-4">
          <h2 className="text-lg font-semibold">Student List</h2>
        </div>
        {students && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Roll</th>
                <th>Name</th>
                <th>s_code</th>
                <th>Status</th>
                <th>Uploaded Script</th>
                <th>Answer Script PDF</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>{s.roll}</td>
                  <td>{s.name}</td>
                  <td>{s.sCode}</td>
                  <td>{s.processingStatus}</td>
                  <td>
                    {s.scriptUrl ? (
                      <a
                        href={s.scriptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline"
                      >
                        View PDF ({s.scriptStatus})
                      </a>
                    ) : (
                      <span className="text-text-muted">Not uploaded</span>
                    )}
                  </td>
                  <td>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="input-field py-2"
                      disabled={uploadingStudentId === s.id}
                      onChange={(e) =>
                        handlePdfUpload(s.id, e.target.files?.[0])
                      }
                    />
                    {uploadingStudentId === s.id && (
                      <p className="text-sm text-text-muted mt-1">
                        Uploading...
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pdfUploadMutation.error && (
          <div className="bg-danger-bg text-danger border border-danger/20 px-4 py-3 mt-4 text-sm">
            {pdfUploadMutation.error.message}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// export function ResultsPage() {
//   const [sessionId, setSessionId] = useState("");

//   const exportCsv = () => {
//     window.open(`/api/v1/results/export/csv?sessionId=${sessionId}`, "_blank");
//   };

//   return (
//     <AppLayout>
//       <div className="p-6 max-w-2xl">
//         <h1 className="text-xl font-semibold mb-6">Results & Export</h1>
//         <div className="mb-4">
//           <label className="block text-sm font-medium mb-1">Session ID</label>
//           <input
//             className="input-field"
//             value={sessionId}
//             onChange={(e) => setSessionId(e.target.value)}
//           />
//         </div>
//         <div className="flex gap-3">
//           <button
//             type="button"
//             onClick={exportCsv}
//             className="btn-primary"
//             disabled={!sessionId}
//           >
//             Export CSV
//           </button>
//           <button
//             type="button"
//             className="btn-secondary"
//             disabled={!sessionId}
//             onClick={() => api.post("/results/publish", { sessionId })}
//           >
//             Publish Results
//           </button>
//         </div>
//       </div>
//     </AppLayout>
//   );
// }

export function ResultsPage() {
  const [sessionId, setSessionId] = useState("");
  const [results, setResults] = useState<MeritRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // const fetchResults = async () => {
  //   if (!sessionId) return;
  //   setLoading(true);
  //   setError("");
  //   try {
  //     const res = await api.get(`/results/merit-list?sessionId=${sessionId}`);
  //     setResults(res.data.data as MeritRow[]);
  //   } catch (err) {
  //     setError("Failed to load results. Check the session ID and try again.");
  //     setResults([]);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const fetchResults = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.get<MeritRow[]>(
        `/results/merit-list?sessionId=${sessionId}`,
      );
      setResults(res);
    } catch (err) {
      setError("Failed to load results. Check the session ID and try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    window.open(`/api/v1/results/export/csv?sessionId=${sessionId}`, "_blank");
  };

  const publish = async () => {
    await api.post("/results/publish", { sessionId });
    fetchResults(); // refresh after publishing
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl">
        <h1 className="text-xl font-semibold mb-6">Results & Export</h1>

        <div className="mb-4 flex gap-3 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Session ID</label>
            <input
              className="input-field"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={fetchResults}
            className="btn-secondary"
            disabled={!sessionId || loading}
          >
            {loading ? "Loading..." : "Load Results"}
          </button>
        </div>

        <div className="flex gap-3 mb-6">
          <button
            type="button"
            onClick={exportCsv}
            className="btn-primary"
            disabled={!sessionId}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!sessionId}
            onClick={publish}
          >
            Publish Results
          </button>
        </div>

        {error && <p className="text-red-600 mb-4">{error}</p>}

        {results.length > 0 && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4">Roll</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">S. Code</th>
                <th className="py-2 pr-4">Obtained</th>
                <th className="py-2 pr-4">Total</th>
                <th className="py-2 pr-4">%</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={`${r.roll}-${i}`} className="border-b">
                  <td className="py-2 pr-4">{r.roll}</td>
                  <td className="py-2 pr-4">{r.name}</td>
                  <td className="py-2 pr-4">{r.sCode}</td>
                  <td className="py-2 pr-4">{r.totalObtained}</td>
                  <td className="py-2 pr-4">{r.totalPossible}</td>
                  <td className="py-2 pr-4">{r.percentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {results.length === 0 && !loading && sessionId && !error && (
          <p className="text-gray-500">
            No results loaded yet. Click "Load Results".
          </p>
        )}
      </div>
    </AppLayout>
  );
}
