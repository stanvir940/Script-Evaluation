import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { EvaluationWorkspace } from '@ase/shared-types';
import { api } from '../api/client';
import { AppLayout } from '../components/layout/AppLayout';
import { SessionProgressBar } from '../components/ui/ProgressBar';
import { QuestionPanel } from '../components/evaluation/QuestionPanel';
import { AnswerImageViewer } from '../components/evaluation/AnswerImageViewer';
import { EvaluationActionBar } from '../components/evaluation/EvaluationActionBar';
import { ShortcutsModal } from '../components/evaluation/ShortcutsModal';

export function EvaluationPage() {
  const [workspace, setWorkspace] = useState<EvaluationWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  const loadNext = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<EvaluationWorkspace | null>('/evaluations/next');
      setWorkspace(res.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignment');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  const handleSave = useCallback(async (mark: number | undefined, comment: string) => {
    if (!workspace) return;
    setSaving(true);
    try {
      await api.post(`/evaluations/assignments/${workspace.assignmentId}/save`, { mark, comment });
      setDraftSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [workspace]);

  const handleSubmit = useCallback(async (mark: number, comment: string) => {
    if (!workspace) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post<{ submitted: boolean; next: EvaluationWorkspace | null }>(
        `/evaluations/assignments/${workspace.assignmentId}/submit`,
        { mark, comment }
      );
      if (res.data?.next) {
        setWorkspace(res.data.next);
      } else {
        setWorkspace(null);
      }
      setDraftSavedAt(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }, [workspace]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === '?' && e.shiftKey) setShowShortcuts(true);
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          if (workspace && !submitting) {
            const markInput = document.getElementById('mark-input') as HTMLInputElement;
            const mark = parseFloat(markInput?.value ?? '');
            const comment = (document.getElementById('comment-input') as HTMLTextAreaElement)?.value ?? '';
            if (!isNaN(mark)) handleSubmit(mark, comment);
          }
          break;
        case 's':
          e.preventDefault();
          if (workspace && !saving) {
            const markInput = document.getElementById('mark-input') as HTMLInputElement;
            const markVal = markInput?.value === '' ? undefined : parseFloat(markInput.value);
            const comment = (document.getElementById('comment-input') as HTMLTextAreaElement)?.value ?? '';
            handleSave(markVal, comment);
          }
          break;
        case '?':
          setShowShortcuts(true);
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [workspace, submitting, saving, handleSubmit, handleSave]);

  const progressMeta = workspace
    ? `Q${workspace.questionNumber} ${workspace.subject.name} · Script ${workspace.candidateId}`
    : undefined;

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-56px)]">
        <div className="flex items-center justify-between px-6 py-2 bg-white border-b border-border shrink-0">
          <Link to="/" className="text-sm text-text-secondary hover:text-primary">
            ← Exit Evaluation
          </Link>
          <button type="button" onClick={() => setShowShortcuts(true)} className="btn-ghost text-sm">
            ? Shortcuts
          </button>
        </div>

        {workspace && (
          <SessionProgressBar
            assigned={workspace.progress.assigned}
            completed={workspace.progress.completed}
            remaining={workspace.progress.remaining}
            current={workspace.progress.current}
            meta={progressMeta}
          />
        )}

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-text-secondary text-lg">Loading next answer...</p>
          </div>
        )}

        {!loading && !workspace && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="panel p-8 text-center max-w-md">
              <h2 className="text-xl font-semibold text-text-primary mb-2">All Assignments Complete</h2>
              <p className="text-text-secondary mb-6">You have evaluated all assigned answers.</p>
              <Link to="/" className="btn-primary">
                Return to Dashboard
              </Link>
            </div>
          </div>
        )}

        {!loading && workspace && (
          <>
            <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
              <QuestionPanel
                questionNumber={workspace.questionNumber}
                subject={workspace.subject}
                maxMarks={workspace.maxMarks}
                questionText={workspace.questionText}
                rubric={workspace.rubric}
                modelAnswer={workspace.modelAnswer}
              />
              <div className="flex-1 overflow-hidden min-h-[300px]">
                <AnswerImageViewer
                  src={workspace.answerImageUrl}
                  alt={`Answer for question ${workspace.questionNumber}`}
                  candidateId={workspace.candidateId}
                  pageNumber={workspace.pageNumber}
                />
              </div>
            </div>

            {error && (
              <div className="px-6 py-2 bg-danger-bg text-danger text-sm border-t border-danger/20">
                {error}
              </div>
            )}

            {draftSavedAt && (
              <p className="px-6 py-1 text-xs text-text-muted bg-white">Draft saved at {draftSavedAt}</p>
            )}

            <EvaluationActionBar
              maxMarks={workspace.maxMarks}
              initialMark={workspace.draftMark}
              initialComment={workspace.draftComment}
              onSave={handleSave}
              onSubmit={handleSubmit}
              submitting={submitting}
              saving={saving}
            />
          </>
        )}
      </div>

      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </AppLayout>
  );
}
