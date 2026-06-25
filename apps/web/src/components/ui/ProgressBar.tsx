import { ReactNode } from 'react';

interface Props {
  assigned: number;
  completed: number;
  remaining: number;
  current?: number;
  meta?: string;
}

export function SessionProgressBar({ assigned, completed, remaining, current, meta }: Props) {
  const pct = assigned > 0 ? (completed / assigned) * 100 : 0;

  return (
    <div className="bg-surface border-b border-border px-6 py-3 shrink-0">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-text-secondary mb-2">
        <span>
          Assigned: <strong className="text-text-primary">{assigned}</strong>
        </span>
        <span>
          Completed: <strong className="text-success">{completed}</strong>
        </span>
        <span>
          Remaining: <strong className="text-text-primary">{remaining}</strong>
        </span>
        {current !== undefined && (
          <span className="text-text-muted">
            Current: {current} of {assigned}
          </span>
        )}
      </div>
      <div className="h-2 bg-surface-alt border border-border">
        <div
          className="h-full bg-primary transition-none"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={assigned}
        />
      </div>
      {meta && <p className="text-sm text-text-muted mt-1">{meta}</p>}
    </div>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{children}</div>;
}

export function StatBox({ label, value, variant }: { label: string; value: number | string; variant?: 'success' | 'danger' }) {
  return (
    <div className="stat-box">
      <p className="stat-label">{label}</p>
      <p
        className={`stat-value ${
          variant === 'success' ? 'text-success' : variant === 'danger' ? 'text-danger' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}
