import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import {
  AppStatusSelect,
  CollegeForm,
  ErrorText,
  ProgressBar,
  RequirementForm,
  StatusBadge,
  TagChip,
  formatDate,
  pretty,
} from '../components/ui.jsx';

export default function CollegeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [tags, setTags] = useState([]);
  const [essays, setEssays] = useState([]);
  const [vocab, setVocab] = useState({ topics: [], types: [] });
  const [editingReq, setEditingReq] = useState(null); // 'new' | requirement id | null
  const [editingCollege, setEditingCollege] = useState(false);
  const [error, setError] = useState(null);

  const load = () => api.college(id).then(setData).catch(setError);
  useEffect(() => {
    load();
    api.tags().then((d) => setTags(d.tags)).catch(() => {});
    api.essays().then((d) => setEssays(d.essays)).catch(() => {});
    api.topics().then(setVocab).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (fn) => async (...args) => {
    setError(null);
    try {
      await fn(...args);
      await load();
    } catch (e) {
      setError(e);
    }
  };

  if (!data) return <p className="pad muted">{error ? <ErrorText error={error} /> : 'Loading…'}</p>;
  const { college, my: mine, requirements } = data;
  const isCustom = !!college.created_by;
  const myTagIds = new Set(mine?.tags.map((t) => t.id));
  const required = requirements.filter((r) => !r.optional);
  const done = required.filter((r) => r.status === 'complete').length;
  const percent = required.length ? Math.round((100 * done) / required.length) : 0;

  const toggleTag = run(async (tagId) => {
    const ids = new Set(myTagIds);
    ids.has(tagId) ? ids.delete(tagId) : ids.add(tagId);
    await api.updateMyCollege(mine.id, { tag_ids: [...ids] });
  });

  const startEssay = run(async (req) => {
    const { essay } = await api.createEssay({ title: `${college.name}: ${req.title}`, requirement_id: req.id });
    navigate(`/essays/${essay.id}`);
  });

  const saveCollege = run(async (form) => {
    await api.updateCollege(college.id, form);
    setEditingCollege(false);
  });

  const deleteCollege = async () => {
    if (!confirm(`Delete “${college.name}” and all its requirements? Essays you wrote stay, but are unassigned from it.`)) return;
    try {
      await api.deleteCollege(college.id);
      navigate('/colleges');
    } catch (e) {
      setError(e);
    }
  };

  const saveReq = run(async (form) => {
    if (editingReq === 'new') await api.addRequirement(college.id, form);
    else await api.updateRequirement(college.id, editingReq, form);
    setEditingReq(null);
  });

  const deleteReq = (r) => run(async () => {
    if (!confirm(`Delete “${r.title}”?`)) return;
    await api.deleteRequirement(college.id, r.id);
  })();

  const deadlines = [
    ['ED', college.deadline_ed],
    ['EA', college.deadline_ea],
    ['RD', college.deadline_rd],
  ].filter(([, d]) => d);

  return (
    <div className="page">
      <Link to="/colleges" className="back">← All colleges</Link>

      {editingCollege ? (
        <CollegeForm initial={college} submitLabel="Save school" onSubmit={saveCollege} onCancel={() => setEditingCollege(false)} />
      ) : (
        <header className="page-header">
          <div>
            <h1>
              {college.name} {isCustom && <span className="pill">custom</span>}
            </h1>
            <p className="muted">
              {[college.location, college.platform === 'own' ? 'School’s own application' : college.platform].filter(Boolean).join(' · ')}
            </p>
            <div className="deadline-chips">
              {deadlines.length === 0 && <span className="muted small">No deadlines set</span>}
              {deadlines.map(([round, d]) => (
                <span key={round} className={`deadline-chip ${mine?.round === round ? 'mine' : ''}`}>
                  <strong>{round}</strong> {formatDate(d)}
                </span>
              ))}
            </div>
          </div>
          <div className="header-actions">
            {!mine && <button onClick={run(() => api.addMyCollege(college.id, college.deadline_ed ? 'ED' : college.deadline_ea ? 'EA' : 'RD'))}>Add to my list</button>}
            {isCustom && (
              <>
                <button className="secondary" onClick={() => setEditingCollege(true)}>Edit school</button>
                <button className="ghost danger" onClick={deleteCollege}>Delete</button>
              </>
            )}
          </div>
        </header>
      )}

      {!isCustom && (
        <p className="muted small source">
          {college.source_url ? <a href={college.source_url} target="_blank" rel="noreferrer">Official requirements page ↗</a> : 'No source link yet'}
          {college.last_verified ? ` · last verified ${formatDate(college.last_verified)}` : ''} · Requirements change every year, so double-check the official site before submitting.
        </p>
      )}
      <ErrorText error={error} />

      {mine && (
        <section className="card my-app">
          <div className="my-app-grid">
            <label>
              Application status
              <AppStatusSelect value={mine.app_status} onChange={(v) => run(() => api.updateMyCollege(mine.id, { app_status: v }))()} />
            </label>
            <label>
              Round
              <select value={mine.round} onChange={(e) => run(() => api.updateMyCollege(mine.id, { round: e.target.value }))()}>
                <option>ED</option><option>EA</option><option>RD</option>
              </select>
            </label>
            <div className="progress-block">
              <span className="label-text">Progress</span>
              <ProgressBar percent={percent} />
              <span className="muted small">{done} of {required.length} required items done</span>
            </div>
          </div>
          <div className="row wrap tags-row">
            <span className="label-text">Tags</span>
            {tags.length === 0 ? (
              <Link to="/tags" className="small">Create tags</Link>
            ) : (
              <span className="chips">
                {tags.map((t) => (
                  <button key={t.id} className={`chip-toggle ${myTagIds.has(t.id) ? 'on' : ''}`} onClick={() => toggleTag(t.id)}>
                    {myTagIds.has(t.id) ? <TagChip tag={t} /> : `+ ${t.name}`}
                  </button>
                ))}
              </span>
            )}
            <span className="spacer" />
            <button className="ghost danger small" onClick={run(async () => { await api.removeMyCollege(mine.id); navigate('/'); })}>Remove from my list</button>
          </div>
        </section>
      )}

      <section className="card">
        <div className="row">
          <h2>Requirements</h2>
          <span className="spacer" />
          {editingReq === null && <button className="secondary" onClick={() => setEditingReq('new')}>+ Add custom requirement</button>}
        </div>

        {editingReq === 'new' && (
          <RequirementForm vocab={vocab} submitLabel="Add requirement" onSubmit={saveReq} onCancel={() => setEditingReq(null)} />
        )}

        {requirements.length === 0 && editingReq !== 'new' && <p className="muted">No requirements yet. Add the ones this school asks for.</p>}

        <ul className="checklist">
          {requirements.map((r) =>
            editingReq === r.id ? (
              <li key={r.id}>
                <RequirementForm initial={r} vocab={vocab} submitLabel="Save" onSubmit={saveReq} onCancel={() => setEditingReq(null)} />
              </li>
            ) : (
              <li key={r.id} className={`req req-${r.status || 'none'}`}>
                <div className="row wrap">
                  <span className={`type-icon type-${r.type}`} title={pretty(r.type)} />
                  <strong>{r.title}</strong>
                  {r.optional && <span className="pill">optional</span>}
                  {r.created_by && <span className="pill">custom</span>}
                  {r.word_limit && <span className="muted small">{r.word_limit} words</span>}
                  <span className="spacer" />
                  {r.created_by && editingReq === null && (
                    <span className="req-actions">
                      <button className="ghost small" onClick={() => setEditingReq(r.id)}>Edit</button>
                      <button className="ghost small danger" onClick={() => deleteReq(r)}>Delete</button>
                    </span>
                  )}
                  {mine && (r.type === 'essay' ? <StatusBadge status={r.status} /> : (
                    <select className={`status-select status-${r.status}`} value={r.status} onChange={(e) => run(() => api.setRequirementStatus(r.id, e.target.value))()}>
                      <option value="not_started">Not started</option>
                      <option value="in_progress">In progress</option>
                      <option value="complete">Complete</option>
                    </select>
                  ))}
                </div>
                {r.prompt_text && <p className="prompt">{r.prompt_text}</p>}
                {r.topics?.length > 0 && (
                  <div className="topic-list">
                    {r.topics.map((t) => <span key={t} className="topic">{pretty(t)}</span>)}
                  </div>
                )}

                {mine && r.type === 'essay' && (
                  <div className="actions">
                    {r.essays.map((e) => (
                      <Link key={e.id} to={`/essays/${e.id}`} className="essay-link">✎ {e.title}</Link>
                    ))}
                    {r.status === 'reusable' && (
                      <div className="alert">
                        <span className="small">{r.reuse.reason}</span>
                        <span className="row">
                          <button className="small" onClick={run(() => api.acceptReuse(r.id))}>Use it</button>
                          <button className="secondary small" onClick={run(() => api.dismissReuse(r.id))}>Dismiss</button>
                        </span>
                      </div>
                    )}
                    {r.essays.length === 0 && (
                      <>
                        <button className="secondary small" onClick={() => startEssay(r)}>Start essay</button>
                        {essays.length > 0 && (
                          <select className="small" value="" onChange={(e) => run(() => api.assignEssay(Number(e.target.value), r.id))()}>
                            <option value="">Assign existing essay…</option>
                            {essays.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                          </select>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}
