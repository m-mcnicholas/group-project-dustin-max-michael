import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorText, formatDate } from '../components/ui.jsx';

const EMPTY = { name: '', location: '', platform: 'own', deadline_ed: '', deadline_ea: '', deadline_rd: '' };

export default function Colleges() {
  const [search, setSearch] = useState('');
  const [colleges, setColleges] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
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

  async function createCustom(e) {
    e.preventDefault();
    try {
      const { college } = await api.createCollege(form);
      await api.addMyCollege(college.id, 'RD');
      setForm(EMPTY);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err);
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="page">
      <div className="row">
        <h1>Colleges</h1>
        <span className="spacer" />
        <button className="secondary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ Add custom school'}</button>
      </div>
      <p className="muted small">Requirements change every year. Always double-check each school’s official admissions site.</p>
      <ErrorText error={error} />

      {showForm && (
        <form className="card form-grid" onSubmit={createCustom}>
          <label>Name<input value={form.name} onChange={set('name')} required /></label>
          <label>Location<input value={form.location} onChange={set('location')} /></label>
          <label>
            Platform
            <select value={form.platform} onChange={set('platform')}>
              <option>Common App</option><option>Coalition</option><option>UC</option><option value="own">School’s own</option>
            </select>
          </label>
          <label>ED deadline<input type="date" value={form.deadline_ed} onChange={set('deadline_ed')} /></label>
          <label>EA deadline<input type="date" value={form.deadline_ea} onChange={set('deadline_ea')} /></label>
          <label>RD deadline<input type="date" value={form.deadline_rd} onChange={set('deadline_rd')} /></label>
          <button type="submit">Create and add to my list</button>
        </form>
      )}

      <input className="search" placeholder="Search by name or location…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <table className="table">
        <thead>
          <tr><th>School</th><th>Location</th><th>Platform</th><th>RD deadline</th><th /></tr>
        </thead>
        <tbody>
          {colleges.map((c) => (
            <tr key={c.id}>
              <td>
                <Link to={`/colleges/${c.id}`}>{c.name}</Link>
                {c.created_by && <span className="pill">custom</span>}
              </td>
              <td>{c.location}</td>
              <td>{c.platform}</td>
              <td>{formatDate(c.deadline_rd)}</td>
              <td>{c.on_my_list ? <span className="muted">On my list ✓</span> : <button onClick={() => add(c)}>Add to my list</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
