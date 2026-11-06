// Small shared UI pieces.
import { useState } from 'react';

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

// Where an application stands overall (user_colleges.app_status).
export const APP_STATUSES = [
  { value: 'planning', label: 'Planning' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'rejected', label: 'Rejected' },
];
const APP_STATUS_LABEL = Object.fromEntries(APP_STATUSES.map((s) => [s.value, s.label]));

export function AppStatusBadge({ status }) {
  return <span className={`app-status app-status-${status}`}>{APP_STATUS_LABEL[status] || status}</span>;
}

export function AppStatusSelect({ value, onChange }) {
  return (
    <select className={`app-status-select app-status-${value}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {APP_STATUSES.map((s) => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  );
}

export function TagChip({ tag }) {
  return (
    <span className="chip" style={{ '--chip': tag.color }}>
      {tag.name}
    </span>
  );
}

export function ProgressBar({ percent }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} title={`${percent}%`}>
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

/** "Today", "Tomorrow", "in 12 days", "3 days ago". */
export function daysLabel(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** urgent (≤7 days), soon (≤30), later. */
export const urgency = (days) => (days < 0 ? 'past' : days <= 7 ? 'urgent' : days <= 30 ? 'soon' : 'later');

const EMPTY_COLLEGE = { name: '', location: '', platform: 'own', deadline_ed: '', deadline_ea: '', deadline_rd: '' };

/** Create/edit form for a custom school. */
export function CollegeForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_COLLEGE, ...clean(initial) }));
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <form
      className="card form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <label>Name<input value={form.name} onChange={set('name')} required /></label>
      <label>Location<input value={form.location} onChange={set('location')} placeholder="City, ST" /></label>
      <label>
        Platform
        <select value={form.platform} onChange={set('platform')}>
          <option>Common App</option><option>Coalition</option><option>UC</option><option value="own">School’s own</option>
        </select>
      </label>
      <label>ED deadline<input type="date" value={form.deadline_ed} onChange={set('deadline_ed')} /></label>
      <label>EA deadline<input type="date" value={form.deadline_ea} onChange={set('deadline_ea')} /></label>
      <label>RD deadline<input type="date" value={form.deadline_rd} onChange={set('deadline_rd')} /></label>
      <div className="full row">
        <button type="submit">{submitLabel}</button>
        {onCancel && <button type="button" className="secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

const EMPTY_REQ = { type: 'essay', title: '', prompt_text: '', word_limit: '', optional: false, topics: [] };

/** Create/edit form for a custom requirement or essay prompt. */
export function RequirementForm({ initial, vocab, submitLabel, onSubmit, onCancel }) {
  const [req, setReq] = useState(() => ({ ...EMPTY_REQ, ...clean(initial) }));
  return (
    <form
      className="form-grid req-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...req, word_limit: Number(req.word_limit) || null });
      }}
    >
      <label>
        Type
        <select value={req.type} onChange={(e) => setReq({ ...req, type: e.target.value })}>
          {vocab.types.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
        </select>
      </label>
      <label>Title<input value={req.title} onChange={(e) => setReq({ ...req, title: e.target.value })} required /></label>
      <label className="inline checkbox">
        <input type="checkbox" checked={!!req.optional} onChange={(e) => setReq({ ...req, optional: e.target.checked })} />
        Optional
      </label>
      {req.type === 'essay' && (
        <>
          <label className="full">Prompt<textarea rows={3} value={req.prompt_text} onChange={(e) => setReq({ ...req, prompt_text: e.target.value })} /></label>
          <label>Word limit<input type="number" min="1" value={req.word_limit} onChange={(e) => setReq({ ...req, word_limit: e.target.value })} /></label>
          <fieldset className="full topics">
            <legend>Topics (used for reuse detection)</legend>
            {vocab.topics.map((t) => (
              <label key={t} className={`topic-toggle ${req.topics.includes(t) ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={req.topics.includes(t)}
                  onChange={(e) => setReq({ ...req, topics: e.target.checked ? [...req.topics, t] : req.topics.filter((x) => x !== t) })}
                />
                {pretty(t)}
              </label>
            ))}
          </fieldset>
        </>
      )}
      <div className="full row">
        <button type="submit">{submitLabel}</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// Turn nulls into '' so controlled inputs stay controlled.
function clean(obj = {}) {
  return Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k, v ?? '']));
}
