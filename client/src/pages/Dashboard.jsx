import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorText, ProgressBar, TagChip, formatDate } from '../components/ui.jsx';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [tags, setTags] = useState([]);
  const [tagFilter, setTagFilter] = useState('');
  const [error, setError] = useState(null);

  const load = () => api.dashboard(tagFilter).then(setData).catch(setError);
  useEffect(() => {
    load();
  }, [tagFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.tags().then((d) => setTags(d.tags)).catch(() => {});
  }, []);

  async function act(fn, reqId) {
    try {
      await fn(reqId);
      load();
    } catch (e) {
      setError(e);
    }
  }

  if (!data) return <p className="pad muted">{error ? <ErrorText error={error} /> : 'Loading…'}</p>;

  return (
    <div className="page">
      <div className="row">
        <h1>My schools</h1>
        <span className="spacer" />
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <ErrorText error={error} />

      {data.colleges.length === 0 ? (
        <p className="muted">
          No schools yet. <Link to="/colleges">Browse colleges</Link> to add some.
        </p>
      ) : (
        <div className="grid">
          {data.colleges.map((c) => (
            <Link to={`/colleges/${c.id}`} key={c.id} className="card school">
              <div className="row">
                <h3>{c.name}</h3>
                <span className="spacer" />
                <span className="pill">{c.round}</span>
              </div>
              <div className="chips">{c.tags.map((t) => <TagChip key={t.id} tag={t} />)}</div>
              <ProgressBar percent={c.progress.percent} />
              <p className="muted small">
                {c.progress.done}/{c.progress.total} required items · Next deadline {formatDate(c.next_deadline)}
              </p>
            </Link>
          ))}
        </div>
      )}

      <div className="two-col">
        <section className="card">
          <h2>♻ Reuse opportunities</h2>
          {data.reuseAlerts.length === 0 && <p className="muted">Finish an essay and we’ll flag other prompts it could cover.</p>}
          {data.reuseAlerts.map((a) => (
            <div key={a.requirement_id} className="alert">
              <p>
                <strong>{a.essay_title}</strong> could work for <Link to={`/colleges/${a.college_id}`}>{a.college_name}</Link>: “{a.requirement_title}”
              </p>
              <p className="muted small">{a.reason}</p>
              <button onClick={() => act(api.acceptReuse, a.requirement_id)}>Use this essay</button>{' '}
              <button className="secondary" onClick={() => act(api.dismissReuse, a.requirement_id)}>Dismiss</button>
            </div>
          ))}
        </section>

        <section className="card">
          <h2>Deadlines</h2>
          {data.deadlines.length === 0 && <p className="muted">No deadlines yet.</p>}
          <ul className="timeline">
            {data.deadlines.map((d) => (
              <li key={d.college_id} className={d.past ? 'past' : ''}>
                <span className="date">{formatDate(d.date)}</span> {d.college_name} <span className="pill">{d.round}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
