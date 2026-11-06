import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { CollegeForm, ErrorText, formatDate } from '../components/ui.jsx';

const earlyDeadline = (c) => (c.deadline_ed ? ['ED', c.deadline_ed] : c.deadline_ea ? ['EA', c.deadline_ea] : null);

export default function Colleges() {
  const [search, setSearch] = useState('');
  const [colleges, setColleges] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);

  const load = () => api.colleges(search).then((d) => setColleges(d.colleges)).catch(setError);
  useEffect(() => {
    const t = setTimeout(load, 200); // debounce typing
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(college) {
    try {
      await api.addMyCollege(college.id, college.deadline_ed ? 'ED' : college.deadline_ea ? 'EA' : 'RD');
      load();
    } catch (e) {
      setError(e);
    }
  }

  async function createCustom(form) {
    try {
      const { college } = await api.createCollege(form);
      await api.addMyCollege(college.id, 'RD');
      setShowForm(false);
      load();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Colleges</h1>
          <p className="muted">Requirements change every year. Always double-check each school’s official admissions site.</p>
        </div>
        <div className="header-actions">
          <button className="secondary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ Add custom school'}</button>
        </div>
      </header>
      <ErrorText error={error} />

      {showForm && <CollegeForm submitLabel="Create and add to my list" onSubmit={createCustom} onCancel={() => setShowForm(false)} />}

      <input className="search" type="search" placeholder="Search by name or location…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {colleges?.length === 0 && <p className="muted">No schools match “{search}”. You can add it as a custom school.</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>School</th><th>Platform</th><th>Early</th><th>Regular</th><th /></tr>
          </thead>
          <tbody>
            {colleges?.map((c) => {
              const early = earlyDeadline(c);
              return (
                <tr key={c.id}>
                  <td>
                    <Link to={`/colleges/${c.id}`} className="school-name">{c.name}</Link>
                    {c.created_by && <span className="pill">custom</span>}
                    <div className="muted small">{c.location}</div>
                  </td>
                  <td className="small">{c.platform === 'own' ? 'Own app' : c.platform}</td>
                  <td className="small nowrap">{early ? <><span className="muted">{early[0]}</span> {formatDate(early[1])}</> : '—'}</td>
                  <td className="small nowrap">{formatDate(c.deadline_rd)}</td>
                  <td className="right">
                    {c.on_my_list ? <span className="on-list">✓ On my list</span> : <button className="small" onClick={() => add(c)}>Add</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
