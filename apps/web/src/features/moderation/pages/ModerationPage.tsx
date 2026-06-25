import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ModerationCaseDto, AnnotationAction } from '@dasems/shared-types';
import { api } from '../../../shared/api/client';
import { AppLayout } from '../../../shared/components/layout/AppLayout';
import { AnnotationCanvas } from '../../evaluation/components/AnnotationCanvas';

export function ModerationPage() {
  const [caseData, setCaseData] = useState<ModerationCaseDto | null>(null);
  const [finalMark, setFinalMark] = useState('');
  const [rationale, setRationale] = useState('');
  const [visibleLayer, setVisibleLayer] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadNext = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ModerationCaseDto | null>('/adjudications/next');
      setCaseData(data);
      setFinalMark('');
      setRationale('');
      setVisibleLayer(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadNext(); }, [loadNext]);

  const handleDecide = async () => {
    if (!caseData) return;
    const mark = parseFloat(finalMark);
    if (isNaN(mark) || !rationale.trim()) {
      setError('Final mark and rationale required');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.post<{ finalized: boolean; next: ModerationCaseDto | null }>(
        `/adjudications/${caseData.id}/decide`,
        { finalMark: mark, rationale }
      );
      setCaseData(result.next);
      setFinalMark('');
      setRationale('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const layerAnnotations: AnnotationAction[] =
    caseData?.evaluations[visibleLayer]?.annotations ?? [];

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-56px)]">
        <div className="px-6 py-2 bg-white border-b border-border flex justify-between items-center">
          <Link to="/" className="text-sm text-text-secondary">← Exit</Link>
          {caseData && <span className="badge-danger">Spread: {caseData.markSpread} marks</span>}
        </div>

        {loading && <div className="flex-1 flex items-center justify-center">Loading...</div>}

        {!loading && !caseData && (
          <div className="flex-1 flex items-center justify-center">
            <div className="panel p-8 text-center">
              <h2 className="text-xl font-semibold mb-2">No Pending Cases</h2>
              <Link to="/" className="btn-primary">Dashboard</Link>
            </div>
          </div>
        )}

        {!loading && caseData && (
          <>
            <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
              <div className="w-full lg:w-[320px] p-4 bg-white border-r border-border overflow-y-auto shrink-0">
                <h2 className="text-lg font-semibold">Q{caseData.questionNumber} — {caseData.subject.name}</h2>
                <p className="text-sm text-text-muted mb-4">Script: {caseData.sCode}</p>
                <p className="text-sm mb-4">{caseData.questionText}</p>
                <h3 className="font-semibold mb-1">Rubric</h3>
                <p className="text-sm text-text-secondary whitespace-pre-wrap mb-4">{caseData.rubric}</p>
                <h3 className="font-semibold mb-2">Evaluator Marks</h3>
                {caseData.evaluations.map((ev, i) => (
                  <button
                    key={ev.teacherId}
                    type="button"
                    onClick={() => setVisibleLayer(i)}
                    className={`w-full text-left panel p-3 mb-2 ${visibleLayer === i ? 'border-primary border-2' : ''}`}
                  >
                    <p className="font-medium">{ev.teacherName}</p>
                    <p className="text-xl font-bold">{ev.mark}/{caseData.maxMarks}</p>
                    <p className="text-sm text-text-muted">{ev.comment || '—'}</p>
                  </button>
                ))}
              </div>
              <div className="flex-1">
                <AnnotationCanvas
                  imageUrl={caseData.answerImageUrl}
                  annotations={layerAnnotations}
                  onChange={() => undefined}
                  readOnly
                />
              </div>
            </div>

            {error && <div className="px-6 py-2 bg-danger-bg text-danger text-sm">{error}</div>}

            <div className="sticky bottom-0 bg-white border-t border-border px-6 py-4 flex flex-wrap gap-4 items-end">
              <div className="w-32">
                <label className="block text-sm font-medium mb-1">Final Mark</label>
                <input type="number" value={finalMark} onChange={(e) => setFinalMark(e.target.value)} className="input-field text-center" />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Rationale</label>
                <input value={rationale} onChange={(e) => setRationale(e.target.value)} className="input-field" required />
              </div>
              <button type="button" onClick={handleDecide} className="btn-primary" disabled={submitting}>
                Finalize & Next →
              </button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

export function HeadExaminerDashboard() {
  return (
    <AppLayout>
      <div className="p-6 max-w-4xl">
        <h1 className="text-xl font-semibold mb-6">Head Examiner Dashboard</h1>
        <Link to="/moderation" className="btn-primary text-lg px-8 py-3 inline-flex">Open Moderation Queue</Link>
      </div>
    </AppLayout>
  );
}
