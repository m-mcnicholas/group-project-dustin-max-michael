// Small shared UI pieces.

const STATUS_LABELS = {
  not_started: 'Not started',
  drafting: 'Drafting',
  in_progress: 'In progress',
  complete: 'Complete',
  reusable: '♻ Similar essay can be reused',
};

export function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

export function TagChip({ tag }) {
  return (
    <span className="chip" style={{ background: tag.color }}>
      {tag.name}
    </span>
  );
}

export function ProgressBar({ percent }) {
  return (
    <div className="progress" title={`${percent}%`}>
      <div style={{ width: `${percent}%` }} />
    </div>
  );
}

export function ErrorText({ error }) {
  return error ? <p className="error">{error.message || String(error)}</p> : null;
}

export const formatDate = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export const pretty = (s) => (s || '').replace(/_/g, ' ');
