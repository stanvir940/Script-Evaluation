import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  EvaluationWorkspaceDto,
  AnnotationAction,
  TeacherStatsDto,
} from "@dasems/shared-types";
import { api } from "../../../shared/api/client";
import { AppLayout } from "../../../shared/components/layout/AppLayout";
import { AnnotationCanvas } from "../components/AnnotationCanvas";

// Shape of a single rubric line item, matching the JSON produced for each question:
// { "context": "...", "value": number }
interface RubricItem {
  context: string;
  value: number;
}

/**
 * Renders the rubric as a simple table: Context | Value | toggle button.
 * Clicking a row's button selects/deselects it. The set of selected values
 * is summed and reported to the parent via onSelectionChange, which is
 * responsible for writing the total into the Mark input. Nothing is
 * submitted here — this only affects the local Mark field until Save/Submit
 * is pressed.
 */
function RubricTable({
  items,
  selectedIndexes,
  onToggle,
}: {
  items: RubricItem[];
  selectedIndexes: Set<number>;
  onToggle: (index: number) => void;
}) {
  if (!items || items.length === 0) return null;

  return (
    <table className="w-full text-sm border border-border">
      <thead>
        <tr className="bg-surface text-left">
          <th className="p-2 border-b border-border font-medium">Context</th>
          <th className="p-2 border-b border-border font-medium w-16 text-center">
            Value
          </th>
          <th className="p-2 border-b border-border font-medium w-20 text-center">
            Award
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => {
          const selected = selectedIndexes.has(index);
          return (
            <tr key={index} className="border-b border-border last:border-0">
              <td className="p-2 align-top">{item.context}</td>
              <td className="p-2 align-top text-center">{item.value}</td>
              <td className="p-2 align-top text-center">
                <button
                  type="button"
                  onClick={() => onToggle(index)}
                  className={
                    selected
                      ? "px-2 py-1 rounded bg-primary text-white text-xs"
                      : "px-2 py-1 rounded border border-border text-xs hover:bg-surface"
                  }
                  aria-pressed={selected}
                >
                  {selected ? "Selected" : "Award"}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function QuestionPanel({
  workspace,
  selectedRubricIndexes,
  onToggleRubricItem,
}: {
  workspace: EvaluationWorkspaceDto;
  selectedRubricIndexes: Set<number>;
  onToggleRubricItem: (index: number) => void;
}) {
  const rubricItems: RubricItem[] = workspace.rubric?.items ?? [];

  return (
    <div className="h-full overflow-y-auto bg-white border-r border-border p-4 w-full md:w-[380px] shrink-0">
      <div className="mb-4 pb-4 border-b border-border">
        <h2 className="text-xl font-semibold">Q{workspace.questionNumber}</h2>
        <p className="text-text-secondary">{workspace.subject.name}</p>
        <p className="text-sm text-text-muted">Script: {workspace.sCode}</p>
        <p className="text-sm text-text-muted">
          Max marks: {workspace.maxMarks}
        </p>
      </div>
      <section className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Question</h3>
        <p className="text-base leading-relaxed whitespace-pre-wrap">
          {workspace.questionText}
        </p>
      </section>
      <section className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Rubric</h3>
        <RubricTable
          items={rubricItems}
          selectedIndexes={selectedRubricIndexes}
          onToggle={onToggleRubricItem}
        />
      </section>
      <section className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Model Answer</h3>
        <p className="text-base text-text-secondary bg-surface p-3 border border-border whitespace-pre-wrap">
          {workspace.modelAnswer}
        </p>
      </section>
      {workspace.keywords.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold mb-2">Keywords</h3>
          <p className="text-sm text-text-muted">
            {workspace.keywords.join(", ")}
          </p>
        </section>
      )}
    </div>
  );
}

export function EvaluationPage() {
  const [workspace, setWorkspace] = useState<EvaluationWorkspaceDto | null>(
    null,
  );
  const [annotations, setAnnotations] = useState<AnnotationAction[]>([]);
  const [mark, setMark] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const saveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Indexes of rubric items the evaluator has toggled "on" for the current
  // question. Reset whenever the workspace changes.
  const [selectedRubricIndexes, setSelectedRubricIndexes] = useState<
    Set<number>
  >(new Set());

  const toggleRubricItem = useCallback(
    (index: number) => {
      if (!workspace) return;
      const items: RubricItem[] = workspace.rubric?.items ?? [];

      setSelectedRubricIndexes((prev) => {
        const next = new Set(prev);
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }

        const total = items.reduce(
          (sum, item, i) => (next.has(i) ? sum + item.value : sum),
          0,
        );
        setMark(total.toString());

        return next;
      });
    },
    [workspace],
  );

  const loadNext = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<EvaluationWorkspaceDto | null>(
        "/evaluations/next",
      );
      setWorkspace(data);
      console.log("Loaded workspace:", data);
      setAnnotations(data?.annotations ?? []);
      setMark(data?.draftMark?.toString() ?? "");
      setComment(data?.draftComment ?? "");
      setSelectedRubricIndexes(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  const saveDraft = useCallback(async () => {
    if (!workspace) return;
    try {
      await api.post(
        `/evaluations/assignments/${workspace.assignmentId}/save`,
        {
          mark: mark === "" ? undefined : parseFloat(mark),
          comment,
        },
      );
      await api.post(
        `/evaluations/assignments/${workspace.assignmentId}/annotations`,
        { actions: annotations },
      );
    } catch {
      /* silent autosave */
    }
  }, [workspace, mark, comment, annotations]);

  useEffect(() => {
    if (!workspace) return;
    saveTimer.current = setInterval(saveDraft, 30000);
    return () => {
      if (saveTimer.current) clearInterval(saveTimer.current);
    };
  }, [workspace, saveDraft]);

  const handleSubmit = async () => {
    if (!workspace) return;
    const num = parseFloat(mark);
    if (isNaN(num) || num < 0 || num > workspace.maxMarks) {
      setError(`Enter a valid mark (0–${workspace.maxMarks})`);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.post(
        `/evaluations/assignments/${workspace.assignmentId}/annotations`,
        { actions: annotations },
      );
      const result = await api.post<{
        submitted: boolean;
        next: EvaluationWorkspaceDto | null;
      }>(`/evaluations/assignments/${workspace.assignmentId}/submit`, {
        mark: num,
        comment,
      });
      setWorkspace(result.next);
      setAnnotations(result.next?.annotations ?? []);
      setMark(result.next?.draftMark?.toString() ?? "");
      setComment(result.next?.draftComment ?? "");
      setSelectedRubricIndexes(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-56px)]">
        <div className="flex items-center justify-between px-6 py-2 bg-white border-b border-border">
          <Link
            to="/"
            className="text-sm text-text-secondary hover:text-primary"
          >
            ← Exit
          </Link>
          {workspace && (
            <span className="text-sm text-text-muted">
              {workspace.progress.completed}/{workspace.progress.assigned}{" "}
              completed
            </span>
          )}
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <p>Loading...</p>
          </div>
        )}

        {!loading && !workspace && (
          <div className="flex-1 flex items-center justify-center">
            <div className="panel p-8 text-center">
              <h2 className="text-xl font-semibold mb-2">All Done</h2>
              <Link to="/" className="btn-primary">
                Dashboard
              </Link>
            </div>
          </div>
        )}

        {!loading && workspace && (
          <>
            <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
              <QuestionPanel
                workspace={workspace}
                selectedRubricIndexes={selectedRubricIndexes}
                onToggleRubricItem={toggleRubricItem}
              />
              <div className="flex-1 min-h-[300px]">
                <AnnotationCanvas
                  imageUrl={workspace.answerImageUrl}
                  annotations={annotations}
                  onChange={(a: AnnotationAction[]) => {
                    setAnnotations(a);
                  }}
                />
              </div>
            </div>

            {error && (
              <div className="px-6 py-2 bg-danger-bg text-danger text-sm">
                {error}
              </div>
            )}

            <form
              className="sticky bottom-0 bg-white border-t border-border px-6 py-4 flex flex-wrap gap-4 items-end"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              <div className="w-32">
                <label className="block text-sm font-medium mb-1">
                  Mark / {workspace.maxMarks}
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={workspace.maxMarks}
                  value={mark}
                  onChange={(e) => setMark(e.target.value)}
                  className="input-field text-mark text-center"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium mb-1">
                  Comment
                </label>
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="input-field"
                />
              </div>
              <button
                type="button"
                onClick={saveDraft}
                className="btn-secondary"
              >
                Save
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Submit & Next →"}
              </button>
            </form>
          </>
        )}
      </div>
    </AppLayout>
  );
}

export function TeacherDashboard() {
  const { data: stats } = useQuery({
    queryKey: ["teacher-stats"],
    queryFn: () => api.get<TeacherStatsDto>("/evaluations/stats"),
  });

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl">
        <h1 className="text-xl font-semibold mb-6">Teacher Dashboard</h1>
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="stat-box">
              <p className="stat-label">Assigned</p>
              <p className="stat-value">{stats.assigned}</p>
            </div>
            <div className="stat-box">
              <p className="stat-label">Completed</p>
              <p className="stat-value text-success">{stats.completed}</p>
            </div>
            <div className="stat-box">
              <p className="stat-label">Remaining</p>
              <p className="stat-value">{stats.remaining}</p>
            </div>
            <div className="stat-box">
              <p className="stat-label">Today</p>
              <p className="stat-value">{stats.evaluatedToday}</p>
            </div>
          </div>
        )}
        <Link
          to="/evaluate"
          className="btn-primary text-lg px-8 py-3 inline-flex"
        >
          Start Evaluation
        </Link>
      </div>
    </AppLayout>
  );
}
