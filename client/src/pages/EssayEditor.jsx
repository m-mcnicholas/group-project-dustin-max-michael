import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorText, StatusBadge } from '../components/ui.jsx';

const countWords = (t) => (t.trim().match(/\S+/g) || []).length;

export default function EssayEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [essay, setEssay] = useState(null);
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [promptOptions, setPromptOptions] = useState([]);
  const [suggestions, setSuggestions] = useState(null);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .essay(id)
      .then(({ essay }) => {
        setEssay(essay);
        setDraft({ title: essay.title, content: essay.content });
      })
      .catch(setError);
    // Essay prompts from schools on my list, for the "assign" dropdown.
    api
      .myColleges()
      .then((d) =>
        setPromptOptions(
          d.colleges.flatMap((c) => c.requirements.filter((r) => r.type === 'essay').map((r) => ({ ...r, college_name: c.name }))),
        ),
      )
      .catch(() => {});
  }, [id]);

  async function save(extra = {}) {
    try {
      const status = extra.status ?? (essay.status === 'not_started' && draft.content ? 'drafting' : undefined);
      const res = await api.updateEssay(id, { ...draft, ...(status ? { status } : {}) });
      setEssay(res.essay);
      setSaved(true);
      if (extra.status === 'complete') setSuggestions(res.suggestions);
    } catch (e) {
      setError(e);
    }
  }

  async function assign(reqId) {
    try {
      const res = await api.assignEssay(id, reqId);
      setEssay(res.essay);
      if (res.suggestions.length) setSuggestions(res.suggestions);
    } catch (e) {
      setError(e);
    }
  }

  async function unassign(reqId) {
    setEssay((await api.unassignEssay(id, reqId)).essay);
  }

  if (!essay) return <p className="pad muted">{error ? <ErrorText error={error} /> : 'Loading…'}</p>;

  const words = countWords(draft.content);
  const limits = essay.assignments.map((a) => a.word_limit).filter(Boolean);
  const tightest = limits.length ? Math.min(...limits) : null;
  const assignedIds = new Set(essay.assignments.map((a) => a.id));
  const promptTitle = (reqId) => {
    const p = promptOptions.find((x) => x.id === reqId);
    return p ? `${p.college_name}: ${p.title}` : `Requirement #${reqId}`;
  };

  return (
    <div className="page">
      <Link to="/essays" className="muted small">← All essays</Link>
      <div className="row">
        <input
          className="title-input"
          value={draft.title}
          onChange={(e) => { setDraft({ ...draft, title: e.target.value }); setSaved(false); }}
        />
        <StatusBadge status={essay.status} />
      </div>
      <ErrorText error={error} />

      <section className="card">
        <h3>Prompts this essay covers</h3>
        {essay.assignments.length === 0 && <p className="muted small">Not assigned to any prompt yet.</p>}
        {essay.assignments.map((a) => (
          <div key={a.id} className="row small">
            <Link to={`/colleges/${a.college_id}`}>{a.college_name}</Link>: {a.title}
            {a.word_limit && <span className="muted">({a.word_limit} words)</span>}
            <button className="link" onClick={() => unassign(a.id)}>remove</button>
          </div>
        ))}
        <select value="" onChange={(e) => e.target.value && assign(Number(e.target.value))}>
          <option value="">+ Assign to a prompt…</option>
          {promptOptions.filter((p) => !assignedIds.has(p.id)).map((p) => (
            <option key={p.id} value={p.id}>{p.college_name}: {p.title}</option>
          ))}
        </select>
      </section>

      <textarea
        className="editor"
        value={draft.content}
        placeholder="Start writing…"
        onChange={(e) => { setDraft({ ...draft, content: e.target.value }); setSaved(false); }}
      />
      <div className="row">
        <span className={tightest && words > tightest ? 'error' : 'muted'}>
          {words} words{tightest ? ` / ${tightest} limit` : ''}
        </span>
        <span className="spacer" />
        <button className="secondary" onClick={() => save()} disabled={saved}>{saved ? 'Saved' : 'Save draft'}</button>
        {essay.status === 'complete' ? (
          <button className="secondary" onClick={() => save({ status: 'drafting' })}>Reopen</button>
        ) : (
          <button onClick={() => save({ status: 'complete' })}>Mark complete</button>
        )}
        <button className="link danger" onClick={async () => { if (confirm('Delete this essay?')) { await api.deleteEssay(id); navigate('/essays'); } }}>
          Delete
        </button>
      </div>

      {suggestions && (
        <section className="card">
          <h3>♻ Reuse check</h3>
          {suggestions.length === 0 && <p className="muted">No other prompts on your list look similar enough.</p>}
          {suggestions.map((s) => (
            <p key={s.requirement_id} className="small">
              <strong>{promptTitle(s.requirement_id)}</strong>: {s.autoAssigned ? 'covered automatically (same shared prompt)' : s.reason}
            </p>
          ))}
          {suggestions.some((s) => !s.autoAssigned) && <p className="muted small">Accept or dismiss these on your dashboard.</p>}
        </section>
      )}
    </div>
  );
}
