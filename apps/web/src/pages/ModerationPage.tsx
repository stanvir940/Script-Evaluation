import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AdjudicationCase } from '@ase/shared-types';
import { api } from '../api/client';
import { AppLayout } from '../components/layout/AppLayout';
import { QuestionPanel } from '../components/evaluation/QuestionPanel';
import { AnswerImageViewer } from '../components/evaluation/AnswerImageViewer';

export function ModerationPage() {
  const [caseData, setCaseData] = useState<AdjudicationCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [finalMark, setFinalMark] = useState('');
  const [rationale, setRationale] = useState('');
  const [error, setError] = useState('');

  const loadNext = useCallback(async () => {
    setLoading(true);
    setError('');
    setFinalMark('');
    setRationale('');
    try {
      const res = await api.get<AdjudicationCase | null>('/adjudications/next');
      setCaseData(res.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load case');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  const handleDecide = async () => {
    if (!caseData) return;
    const mark = parseFloat(finalMark);
    if (isNaN(mark) || mark < 0 || mark > caseData.maxMarks) {
      setError(`Enter a valid mark between 0 and ${caseData.maxMarks}`);
      return;
    }
    if (!rationale.trim()) {
      setError('Rationale is required');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await api.post<{ finalized: boolean; next: AdjudicationCase | null }>(
        `/adjudications/${caseData.id}/decide`,
        { finalMark: mark, rationale }
      );
      setCaseData(res.data?.next ?? null);
      setFinalMark('');
      setRationale('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decision failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-56px)]">
        <div className="px-6 py-2 bg-white border-b border-border shrink-0 flex items-center justify-between">
          <Link to="/" className="text-sm text-text-secondary hover:text-primary">
            ← Exit Moderation
          </Link>
          {caseData && (
            <span className="badge-danger">Escalated — Spread: {caseData.markSpread} marks</span>
          )}
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-text-secondary">Loading case...</p>
          </div>
        )}

        {!loading && !caseData && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="panel p-8 text-center">
              <h2 className="text-xl font-semibold mb-2">No Pending Cases</h2>
              <p className="text-text-secondary mb-4">All escalated answers have been reviewed.</p>
              <Link to="/" className="btn-primary">Return to Dashboard</Link>
            </div>
          </div>
        )}

        {!loading && caseData && (
          <>
            <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
              <QuestionPanel
                questionNumber={caseData.questionNumber}
                subject={caseData.subject}
                maxMarks={caseData.maxMarks}
                questionText={caseData.questionText}
                rubric={caseData.rubric}
                modelAnswer={caseData.modelAnswer}
              />
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 min-h-[200px]">
                  <AnswerImageViewer
                    src={caseData.answerImageUrl}
                    alt="Student answer"
                    candidateId={caseData.candidateId}
                    pageNumber={1}
                  />
                </div>

                <div className="bg-white border-t border-border p-4 shrink-0">
                  <h3 className="text-lg font-semibold mb-3">Evaluator Marks</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {caseData.evaluations.map((ev, i) => (
                      <div key={i} className="panel p-3">
                        <p className="font-medium text-text-primary">{ev.teacherName}</p>
                        <p className="text-xl font-bold mt-1">
                          {ev.mark}/{caseData.maxMarks}
                        </p>
                        <p className="text-sm text-text-secondary mt-2">{ev.comment || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-danger-bg border-t border-danger/20 px-6 py-2 text-sm text-danger">
              Mark spread ({caseData.markSpread}) exceeds threshold ({caseData.threshold}). Assign final mark below.
            </div>

            {error && (
              <div className="px-6 py-2 bg-danger-bg text-danger text-sm">{error}</div>
            )}

            <div className="sticky bottom-0 bg-white border-t border-border px-6 py-4">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="lg:w-40">
                  <label className="block text-base font-medium mb-1">
                    Final Mark ( / {caseData.maxMarks} )
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={caseData.maxMarks}
                    value={finalMark}
                    onChange={(e) => setFinalMark(e.target.value)}
                    className="input-field text-mark text-center"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-base font-medium mb-1">Rationale (required)</label>
                  <textarea
                    value={rationale}
                    onChange={(e) => setRationale(e.target.value)}
                    rows={2}
                    className="input-field"
                    placeholder="Explain your final mark decision..."
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleDecide}
                  className="btn-primary min-w-[180px]"
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : 'Finalize & Next →'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
