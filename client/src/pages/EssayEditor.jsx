import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorText, StatusBadge } from '../components/ui.jsx';

const countWords = (t) => (t.trim().match(/\S+/g) || []).length;
const AUTOSAVE_MS = 1200; // save this long after the last keystroke

const SAVE_LABEL = {
  saved: 'All changes saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Couldn’t save. Retrying on your next edit',
};

export default function EssayEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [essay, setEssay] = useState(null);
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [promptOptions, setPromptOptions] = useState([]);
  const [suggestions, setSuggestions] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const [lastSaved, setLastSaved] = useState(null);
  const [error, setError] = useState(null);

  // Refs so timers, unmount and beforeunload handlers always see the latest values.
  const draftRef = useRef(draft);
  const essayRef = useRef(null);
  const dirty = useRef(false);
  const timer = useRef(null);
  const queue = useRef(Promise.resolve()); // serializes saves so responses can't arrive out of order
  const deleted = useRef(false);

  useEffect(() => {
    api
      .essay(id)
      .then(({ essay }) => {
        setEssay(essay);
        essayRef.current = essay;
        const d = { title: essay.title, content: essay.content };
        setDraft(d);
        draftRef.current = d;
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

  /** Save the current draft (plus an optional status change). Queued behind any save in flight. */
  const save = useCallback(
    (extra = {}, opts) => {
      clearTimeout(timer.current);
      const run = async () => {
        const current = essayRef.current;
        if (!current || deleted.current) return null;
        if (!dirty.current && !extra.status) return null;
        const body = { ...draftRef.current };
        const status = extra.status ?? (current.status === 'not_started' && body.content ? 'drafting' : undefined);
        if (status) body.status = status;
        dirty.current = false;
        setSaveState('saving');
        try {
          const res = await api.updateEssay(id, body, opts);
          essayRef.current = res.essay;
          setEssay(res.essay);
          setLastSaved(new Date());
          setSaveState(dirty.current ? 'unsaved' : 'saved'); // user may have typed while we were saving
          return res;
        } catch (e) {
          dirty.current = true;
          setSaveState('error');
          setError(e);
          return null;
        }
      };
      const p = queue.current.then(run);
      queue.current = p.catch(() => {});
      return p;
    },
    [id],
  );

  const edit = (patch) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    dirty.current = true;
    setSaveState('unsaved');
    setError(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(), AUTOSAVE_MS);
  };

  // Flush on leaving the page (in-app navigation) and warn/flush on closing the tab.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!dirty.current) return;
      save({}, { keepalive: true });
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (dirty.current) save();
    };
  }, [save]);

  // Cmd/Ctrl+S saves immediately instead of opening the browser's save dialog.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  async function setStatus(status) {
    const res = await save({ status });
    if (res && status === 'complete') setSuggestions(res.suggestions);
    if (res && status !== 'complete') setSuggestions(null);
  }

  async function assign(reqId) {
    try {
      const res = await api.assignEssay(id, reqId);
      essayRef.current = res.essay;
      setEssay(res.essay);
      if (res.suggestions.length) setSuggestions(res.suggestions);
    } catch (e) {
      setError(e);
    }
  }

  async function unassign(reqId) {
    try {
      const res = await api.unassignEssay(id, reqId);
      essayRef.current = res.essay;
      setEssay(res.essay);
    } catch (e) {
      setError(e);
    }
  }

  async function remove() {
    if (!confirm('Delete this essay? This can’t be undone.')) return;
    deleted.current = true;
    clearTimeout(timer.current);
    dirty.current = false;
    await api.deleteEssay(id);
    navigate('/essays');
  }

  if (!essay) return <p className="pad muted">{error ? <ErrorText error={error} /> : 'Loading…'}</p>;

  const words = countWords(draft.content);
  const limits = essay.assignments.map((a) => a.word_limit).filter(Boolean);
  const tightest = limits.length ? Math.min(...limits) : null;
  const over = tightest && words > tightest;
  const assignedIds = new Set(essay.assignments.map((a) => a.id));
  const promptTitle = (reqId) => {
    const p = promptOptions.find((x) => x.id === reqId);
    return p ? `${p.college_name}: ${p.title}` : `Requirement #${reqId}`;
  };
  const promptsById = new Map(promptOptions.map((p) => [p.id, p]));

  return (
    <div className="page editor-page">
      <Link to="/essays" className="back">← All essays</Link>
      <div className="row editor-head">
        <input className="title-input" aria-label="Essay title" value={draft.title} onChange={(e) => edit({ title: e.target.value })} />
        <StatusBadge status={essay.status} />
      </div>
      <ErrorText error={error} />

      <div className="editor-layout">
        <div className="editor-main">
          <textarea
            className="editor"
            value={draft.content}
            placeholder="Start writing… Your work saves automatically."
            onChange={(e) => edit({ content: e.target.value })}
          />
          <div className="editor-bar">
            <span className={`word-count ${over ? 'over' : ''}`}>
              {words} words{tightest ? ` / ${tightest}` : ''}
            </span>
            {tightest && <div className="word-meter"><div style={{ width: `${Math.min(100, (100 * words) / tightest)}%` }} className={over ? 'over' : ''} /></div>}
            <span className={`save-state save-${saveState}`} title={lastSaved ? `Last saved ${lastSaved.toLocaleTimeString()}` : undefined}>
              {SAVE_LABEL[saveState]}
            </span>
            <span className="spacer" />
            {essay.status === 'complete' ? (
              <button className="secondary" onClick={() => setStatus('drafting')}>Reopen</button>
            ) : (
              <button onClick={() => setStatus('complete')}>Mark complete</button>
            )}
            <button className="ghost danger" onClick={remove}>Delete</button>
          </div>

          {suggestions && (
            <section className="card reuse-result">
              <h3>♻ Reuse check</h3>
              {suggestions.length === 0 && <p className="muted">No other prompts on your list look similar enough.</p>}
              {suggestions.map((s) => (
                <p key={s.requirement_id} className="small">
                  <strong>{promptTitle(s.requirement_id)}</strong>: {s.autoAssigned ? 'covered automatically (same shared prompt)' : s.reason}
                </p>
              ))}
              {suggestions.some((s) => !s.autoAssigned) && <p className="muted small">Accept or dismiss these on your <Link to="/">dashboard</Link>.</p>}
            </section>
          )}
        </div>

        <aside className="card editor-side">
          <h3>Prompts this essay covers</h3>
          {essay.assignments.length === 0 && <p className="muted small">Not assigned to any prompt yet.</p>}
          <ul className="assigned">
            {essay.assignments.map((a) => (
              <li key={a.id}>
                <div className="row">
                  <Link to={`/colleges/${a.college_id}`}>{a.college_name}</Link>
                  <span className="spacer" />
                  <button className="ghost small" onClick={() => unassign(a.id)} aria-label={`Remove ${a.title}`}>✕</button>
                </div>
                <div className="small">{a.title}{a.word_limit ? <span className={words > a.word_limit ? 'error' : 'muted'}> · {a.word_limit} words</span> : null}</div>
                {promptsById.get(a.id)?.prompt_text && <p className="prompt small">{promptsById.get(a.id).prompt_text}</p>}
              </li>
            ))}
          </ul>
          <select value="" onChange={(e) => e.target.value && assign(Number(e.target.value))}>
            <option value="">+ Assign to a prompt…</option>
            {promptOptions.filter((p) => !assignedIds.has(p.id)).map((p) => (
              <option key={p.id} value={p.id}>{p.college_name}: {p.title}</option>
            ))}
          </select>
        </aside>
      </div>
    </div>
  );
}
