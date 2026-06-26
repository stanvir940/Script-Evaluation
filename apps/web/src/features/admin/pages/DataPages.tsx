import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdmissionSessionDto, DepartmentDto, QuestionDto, StudentAdminDto } from '@dasems/shared-types';
import { api } from '../../../shared/api/client';
import { AppLayout } from '../../../shared/components/layout/AppLayout';

interface StudentUploadRow {
  roll: string;
  name: string;
  faculty: string;
  departmentId: string;
}

interface ParsedStudentRow extends StudentUploadRow {
  rowNumber: number;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
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
  departments: DepartmentDto[]
): { rows: ParsedStudentRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return { rows: [], errors: ['CSV must include a header and at least one student row.'] };

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const indexOf = (name: string) => headers.indexOf(name);
  const rollIndex = indexOf('roll');
  const nameIndex = indexOf('name');
  const facultyIndex = indexOf('faculty');
  const departmentIdIndex = indexOf('departmentid');
  const departmentCodeIndex = indexOf('departmentcode');
  const errors: string[] = [];
  const rows: ParsedStudentRow[] = [];
  const departmentByCode = new Map(departments.map((d) => [d.code.toUpperCase(), d.id]));

  if (rollIndex === -1 || nameIndex === -1 || facultyIndex === -1) {
    return { rows: [], errors: ['Required headers: roll,name,faculty.'] };
  }

  lines.slice(1).forEach((line, idx) => {
    const values = parseCsvLine(line);
    const rowNumber = idx + 2;
    const roll = values[rollIndex]?.trim() ?? '';
    const name = values[nameIndex]?.trim() ?? '';
    const faculty = values[facultyIndex]?.trim() ?? '';
    const departmentCode = values[departmentCodeIndex]?.trim().toUpperCase() ?? '';
    const departmentId = values[departmentIdIndex]?.trim() || departmentByCode.get(departmentCode) || defaultDepartmentId;

    if (!roll || !name || !faculty || !departmentId) {
      errors.push(`Row ${rowNumber}: roll, name, faculty, and department are required.`);
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
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

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
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedStudentRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [uploadingStudentId, setUploadingStudentId] = useState<string | null>(null);

  const { data: sessions } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<AdmissionSessionDto[]>('/sessions'),
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<DepartmentDto[]>('/departments'),
  });

  const { data: students } = useQuery({
    queryKey: ['students', sessionId],
    queryFn: () => api.get<StudentAdminDto[]>(`/students?sessionId=${sessionId}`),
    enabled: Boolean(sessionId),
  });

  const uploadMutation = useMutation({
    mutationFn: (rows: StudentUploadRow[]) =>
      api.post<Array<{ id: string; roll: string; sCode: string }>>('/students/bulk', {
        sessionId,
        students: rows,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students', sessionId] });
      setParsedRows([]);
      setParseErrors([]);
    },
  });

  const pdfUploadMutation = useMutation({
    mutationFn: async ({ studentId, file }: { studentId: string; file: File }) => {
      const pdfBase64 = await fileToBase64(file);
      return api.post<{ scriptId: string; status: string }>(`/students/${studentId}/upload-pdf`, {
        pdfBase64,
        filename: file.name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students', sessionId] });
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
    uploadMutation.mutate(parsedRows.map(({ rowNumber: _rowNumber, ...row }) => row));
  };

  const handlePdfUpload = (studentId: string, file: File | undefined) => {
    if (!file) return;
    setUploadingStudentId(studentId);
    pdfUploadMutation.mutate({ studentId, file });
  };

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-6">Students (Admin — contains PII)</h1>
        <p className="text-sm text-text-muted mb-4">Teachers never see roll, name, or department. They only see s_code.</p>

        <div className="panel p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Session</label>
            <select className="input-field" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">Select session...</option>
              {sessions?.map((session) => (
                <option key={session.id} value={session.id}>{session.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Default Department</label>
            <select className="input-field" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Select department...</option>
              {departments?.map((department) => (
                <option key={department.id} value={department.id}>{department.code} — {department.name}</option>
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
            {parseErrors.map((error) => <p key={error}>{error}</p>)}
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
                {uploadMutation.isPending ? 'Uploading...' : `Upload ${parsedRows.length} Students`}
              </button>
            </div>
            <table className="data-table">
              <thead>
                <tr><th>Row</th><th>Roll</th><th>Name</th><th>Faculty</th></tr>
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

        <div className="mb-4">
          <h2 className="text-lg font-semibold">Student List</h2>
        </div>
        {students && (
          <table className="data-table">
            <thead>
              <tr><th>Roll</th><th>Name</th><th>s_code</th><th>Status</th><th>Answer Script PDF</th></tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>{s.roll}</td>
                  <td>{s.name}</td>
                  <td>{s.sCode}</td>
                  <td>{s.processingStatus}</td>
                  <td>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="input-field py-2"
                      disabled={uploadingStudentId === s.id}
                      onChange={(e) => handlePdfUpload(s.id, e.target.files?.[0])}
                    />
                    {uploadingStudentId === s.id && (
                      <p className="text-sm text-text-muted mt-1">Uploading...</p>
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
