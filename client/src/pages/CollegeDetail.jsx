import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorText, StatusBadge, TagChip, formatDate, pretty } from '../components/ui.jsx';

const NEW_REQ = { type: 'essay', title: '', prompt_text: '', word_limit: '', topics: [] };

export default function CollegeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [tags, setTags] = useState([]);
  const [essays, setEssays] = useState([]);
  const [vocab, setVocab] = useState({ topics: [], types: [] });
  const [newReq, setNewReq] = useState(null);
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
  const myTagIds = new Set(mine?.tags.map((t) => t.id));

  const toggleTag = run(async (tagId) => {
    const ids = new Set(myTagIds);
    ids.has(tagId) ? ids.delete(tagId) : ids.add(tagId);
    await api.updateMyCollege(mine.id, { tag_ids: [...ids] });
  });

  const startEssay = run(async (req) => {
    const { essay } = await api.createEssay({ title: `${college.name}: ${req.title}`, requirement_id: req.id });
    navigate(`/essays/${essay.id}`);
  });

  const submitReq = run(async (e) => {
    e.preventDefault();
    await api.addRequirement(college.id, { ...newReq, word_limit: Number(newReq.word_limit) || null });
    setNewReq(null);
  });

  return (
    <div className="page">
      <Link to="/colleges" className="muted small">← All colleges</Link>
      <div className="row">
        <h1>{college.name}</h1>
        <span className="spacer" />
        {!mine && <button onClick={run(() => api.addMyCollege(college.id, 'RD'))}>Add to my list</button>}
      </div>
      <p className="muted">
        {college.location} · {college.platform} · ED {formatDate(college.deadline_ed)} · EA {formatDate(college.deadline_ea)} · RD{' '}
        {formatDate(college.deadline_rd)}
      </p>
      <p className="muted small">
        {college.source_url ? <a href={college.source_url} target="_blank" rel="noreferrer">Official requirements page</a> : 'No source link yet'}
        {college.last_verified ? ` · last verified ${formatDate(college.last_verified)}` : ''} · Double-check the official site before submitting.
      </p>
      <ErrorText error={error} />

      {mine && (
        <section className="card row wrap">
          <label className="inline">
            Round{' '}
            <select value={mine.round} onChange={(e) => run(() => api.updateMyCollege(mine.id, { round: e.target.value }))()}>
              <option>ED</option><option>EA</option><option>RD</option>
            </select>
          </label>
          <span className="muted">Tags:</span>
          {tags.length === 0 ? (
            <Link to="/tags" className="small">Create tags</Link>
          ) : (
            <span className="chips">
              {tags.map((t) => (
                <button key={t.id} className={`chip-toggle ${myTagIds.has(t.id) ? 'on' : ''}`} onClick={() => toggleTag(t.id)}>
                  {myTagIds.has(t.id) ? <TagChip tag={t} /> : t.name}
                </button>
              ))}
            </span>
          )}
          <span className="spacer" />
          <button className="secondary" onClick={run(async () => { await api.removeMyCollege(mine.id); navigate('/'); })}>Remove from my list</button>
        </section>
      )}

      <section className="card">
        <div className="row">
          <h2>Requirements</h2>
          <span className="spacer" />
          {!newReq && <button className="secondary" onClick={() => setNewReq(NEW_REQ)}>+ Add custom requirement</button>}
        </div>

        {newReq && (
          <form className="form-grid" onSubmit={submitReq}>
            <label>
              Type
              <select value={newReq.type} onChange={(e) => setNewReq({ ...newReq, type: e.target.value })}>
                {vocab.types.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
              </select>
            </label>
            <label>Title<input value={newReq.title} onChange={(e) => setNewReq({ ...newReq, title: e.target.value })} required /></label>
            {newReq.type === 'essay' && (
              <>
                <label className="full">Prompt<textarea value={newReq.prompt_text} onChange={(e) => setNewReq({ ...newReq, prompt_text: e.target.value })} /></label>
                <label>Word limit<input type="number" value={newReq.word_limit} onChange={(e) => setNewReq({ ...newReq, word_limit: e.target.value })} /></label>
                <div className="full chips">
                  {vocab.topics.map((t) => (
                    <label key={t} className="inline small">
                      <input
                        type="checkbox"
                        checked={newReq.topics.includes(t)}
                        onChange={(e) =>
                          setNewReq({ ...newReq, topics: e.target.checked ? [...newReq.topics, t] : newReq.topics.filter((x) => x !== t) })
                        }
                      />
                      {pretty(t)}
                    </label>
                  ))}
                </div>
              </>
            )}
            <div className="full">
              <button type="submit">Save</button> <button type="button" className="secondary" onClick={() => setNewReq(null)}>Cancel</button>
            </div>
          </form>
        )}

        <ul className="checklist">
          {requirements.map((r) => (
            <li key={r.id}>
              <div className="row">
                <strong>{r.title}</strong>
                {r.optional && <span className="pill">optional</span>}
                {r.word_limit && <span className="muted small">{r.word_limit} words</span>}
                <span className="spacer" />
                {mine && (r.type === 'essay' ? <StatusBadge status={r.status} /> : (
                  <select value={r.status} onChange={(e) => run(() => api.setRequirementStatus(r.id, e.target.value))()}>
                    <option value="not_started">Not started</option>
                    <option value="in_progress">In progress</option>
                    <option value="complete">Complete</option>
                  </select>
                ))}
              </div>
              {r.prompt_text && <p className="prompt">{r.prompt_text}</p>}
              {r.topics?.length > 0 && <p className="muted small">Topics: {r.topics.map(pretty).join(', ')}</p>}

              {mine && r.type === 'essay' && (
                <div className="actions">
                  {r.essays.map((e) => (
                    <Link key={e.id} to={`/essays/${e.id}`} className="pill">✎ {e.title}</Link>
                  ))}
                  {r.status === 'reusable' && (
                    <div className="alert">
                      <span className="small">{r.reuse.reason}</span>{' '}
                      <button onClick={run(() => api.acceptReuse(r.id))}>Use it</button>{' '}
                      <button className="secondary" onClick={run(() => api.dismissReuse(r.id))}>Dismiss</button>
                    </div>
                  )}
                  {r.essays.length === 0 && (
                    <>
                      <button className="secondary" onClick={() => startEssay(r)}>Start essay</button>
                      {essays.length > 0 && (
                        <select value="" onChange={(e) => run(() => api.assignEssay(Number(e.target.value), r.id))()}>
                          <option value="">Assign existing essay…</option>
                          {essays.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                        </select>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
