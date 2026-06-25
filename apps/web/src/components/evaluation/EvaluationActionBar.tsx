import { useState, useEffect, FormEvent } from 'react';

interface Props {
  maxMarks: number;
  initialMark?: number;
  initialComment?: string;
  onSave: (mark: number | undefined, comment: string) => void;
  onSubmit: (mark: number, comment: string) => void;
  onPrevious?: () => void;
  submitting: boolean;
  saving: boolean;
}

export function EvaluationActionBar({
  maxMarks,
  initialMark,
  initialComment,
  onSave,
  onSubmit,
  onPrevious,
  submitting,
  saving,
}: Props) {
  const [mark, setMark] = useState<string>(initialMark?.toString() ?? '');
  const [comment, setComment] = useState(initialComment ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    setMark(initialMark?.toString() ?? '');
    setComment(initialComment ?? '');
    setError('');
  }, [initialMark, initialComment]);

  const validateMark = (): number | null => {
    const num = parseFloat(mark);
    if (mark === '' || isNaN(num)) {
      setError('Mark is required');
      return null;
    }
    if (num < 0) {
      setError('Mark cannot be negative');
      return null;
    }
    if (num > maxMarks) {
      setError(`Mark cannot exceed ${maxMarks}`);
      return null;
    }
    setError('');
    return num;
  };

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const validMark = validateMark();
    if (validMark === null) return;
    onSubmit(validMark, comment);
  };

  const handleSave = () => {
    const num = mark === '' ? undefined : parseFloat(mark);
    if (num !== undefined && (isNaN(num) || num < 0 || num > maxMarks)) {
      validateMark();
      return;
    }
    onSave(num, comment);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="sticky bottom-0 bg-white border-t border-border px-6 py-4 shrink-0"
    >
      <div className="flex flex-col lg:flex-row gap-4 lg:items-start">
        <div className="lg:w-40 shrink-0">
          <label htmlFor="mark-input" className="block text-base font-medium text-text-primary mb-1">
            Mark ( / {maxMarks} )
          </label>
          <input
            id="mark-input"
            type="number"
            step="0.5"
            min={0}
            max={maxMarks}
            value={mark}
            onChange={(e) => {
              setMark(e.target.value);
              setError('');
            }}
            onFocus={(e) => e.target.select()}
            className={`input-field text-mark text-center ${error ? 'border-danger' : ''}`}
            aria-describedby={error ? 'mark-error' : undefined}
            disabled={submitting}
          />
          {error && (
            <p id="mark-error" className="text-sm text-danger mt-1">
              {error}
            </p>
          )}
        </div>

        <div className="flex-1">
          <label htmlFor="comment-input" className="block text-base font-medium text-text-primary mb-1">
            Comment (optional)
          </label>
          <textarea
            id="comment-input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="input-field resize-y min-h-[44px]"
            placeholder="Add evaluation comment..."
            disabled={submitting}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        {onPrevious && (
          <button type="button" onClick={onPrevious} className="btn-secondary" disabled={submitting}>
            ← Previous
          </button>
        )}
        <button type="button" onClick={handleSave} className="btn-secondary" disabled={submitting || saving}>
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        <button type="submit" className="btn-primary ml-auto min-w-[160px]" disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit & Next →'}
        </button>
      </div>

      <p className="text-xs text-text-muted mt-3">
        Shortcuts: N Next · P Previous · S Save · Z Zoom · ? Help
      </p>
    </form>
  );
}
