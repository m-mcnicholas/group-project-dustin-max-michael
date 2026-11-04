import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { AppStatusBadge, ErrorText, ProgressBar, TagChip, daysLabel, formatDate, urgency } from '../components/ui.jsx';

const monthKey = (iso) => iso.slice(0, 7);
const monthLabel = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const dayParts = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return { day: d.getDate(), weekday: d.toLocaleDateString(undefined, { weekday: 'short' }) };
};

function StatTile({ label, value, sub }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

/** Deadlines grouped by month, with a "today" marker between past and upcoming entries. */
function DeadlineTimeline({ deadlines }) {
  if (deadlines.length === 0) return <p className="muted">Add schools to see their deadlines here.</p>;
  const groups = [];
  for (const d of deadlines) {
    const key = monthKey(d.date);
    if (groups.at(-1)?.key !== key) groups.push({ key, items: [] });
    groups.at(-1).items.push(d);
  }
  const firstUpcoming = deadlines.find((d) => !d.past);
  return (
    <div className="timeline">
      {groups.map((g) => (
        <div key={g.key} className="timeline-month">
          <h4>{monthLabel(g.key)}</h4>
          <ol>
            {g.items.map((d) => {
              const { day, weekday } = dayParts(d.date);
              const level = d.submitted ? 'done' : urgency(d.days_left);
              return (
                <li key={d.college_id} className={`tl-item tl-${level} ${d === firstUpcoming ? 'tl-first-upcoming' : ''}`}>
                  <div className="tl-date">
                    <span className="tl-day">{day}</span>
                    <span className="tl-weekday">{weekday}</span>
                  </div>
                  <div className="tl-dot" aria-hidden />
                  <div className="tl-body">
                    <Link to={`/colleges/${d.college_id}`}>{d.college_name}</Link> <span className="pill">{d.round}</span>
                    <div className="small tl-meta">
                      {d.submitted ? (
                        <span className="tl-status">✓ <AppStatusBadge status={d.app_status} /></span>
                      ) : (
                        <>
                          <span className="tl-when">{daysLabel(d.days_left)}</span>
                          <span className="muted"> · {d.percent}% ready</span>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

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
  const { summary } = data;
  const next = summary.next_deadline;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>My schools</h1>
        </div>
        {tags.length > 0 && (
          <div className="header-actions tag-filter">
            <button className={`chip-filter ${tagFilter === '' ? 'on' : ''}`} onClick={() => setTagFilter('')}>All</button>
            {tags.map((t) => (
              <button
                key={t.id}
                className={`chip-filter ${String(tagFilter) === String(t.id) ? 'on' : ''}`}
                style={{ '--chip': t.color }}
                onClick={() => setTagFilter(String(t.id))}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </header>
      <ErrorText error={error} />

      {data.colleges.length > 0 && (
        <div className="stats">
          <StatTile label="Schools" value={summary.schools} sub={summary.accepted ? `${summary.accepted} accepted 🎉` : null} />
          <StatTile label="Submitted" value={`${summary.submitted}/${summary.schools}`} />
          <StatTile label="Required essays done" value={`${summary.essays_done}/${summary.essays_total}`} />
          <StatTile
            label="Next deadline"
            value={next ? daysLabel(next.days_left) : '—'}
            sub={next ? `${next.college_name} · ${formatDate(next.date)}` : 'Nothing pending'}
          />
        </div>
      )}

      {data.colleges.length === 0 ? (
        <div className="card empty">
          <h2>{tagFilter ? 'No schools with this tag' : 'Start your list'}</h2>
          <p className="muted">
            {tagFilter ? 'Pick another tag, or tag schools from their page.' : <>Browse <Link to="/colleges">colleges</Link> and add the ones you’re applying to.</>}
          </p>
        </div>
      ) : (
        <div className="grid">
          {data.colleges.map((c) => {
            const days = c.next_deadline ? Math.round((new Date(`${c.next_deadline}T00:00:00`) - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
            return (
              <Link to={`/colleges/${c.id}`} key={c.id} className="card school">
                <div className="school-top">
                  <h3>{c.name}</h3>
                  <span className="pill">{c.round}</span>
                </div>
                <div className="row wrap">
                  <AppStatusBadge status={c.app_status} />
                  {c.tags.map((t) => <TagChip key={t.id} tag={t} />)}
                </div>
                <ProgressBar percent={c.progress.percent} />
                <div className="school-foot small">
                  <span>{c.progress.done}/{c.progress.total} items</span>
                  <span className={days !== null && !['submitted', 'accepted', 'rejected', 'waitlisted'].includes(c.app_status) ? `due-${urgency(days)}` : 'muted'}>
                    {c.next_deadline ? `Due ${formatDate(c.next_deadline)}` : 'No deadline'}
                  </span>
                </div>
              </Link>
            );
          })}
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
              <div className="row">
                <button className="small" onClick={() => act(api.acceptReuse, a.requirement_id)}>Use this essay</button>
                <button className="secondary small" onClick={() => act(api.dismissReuse, a.requirement_id)}>Dismiss</button>
              </div>
            </div>
          ))}
        </section>

        <section className="card">
          <h2>Deadlines</h2>
          <DeadlineTimeline deadlines={data.deadlines} />
        </section>
      </div>
    </div>
  );
}
