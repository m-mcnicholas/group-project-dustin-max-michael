import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorText, StatusBadge } from '../components/ui.jsx';

export default function Essays() {
  const [essays, setEssays] = useState(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.essays().then((d) => setEssays(d.essays)).catch(setError);
  }, []);

  async function create(e) {
    e.preventDefault();
    try {
      const { essay } = await api.createEssay({ title });
      navigate(`/essays/${essay.id}`);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="page">
      <h1>Essays</h1>
      <form className="row" onSubmit={create}>
        <input placeholder="New essay title…" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <button type="submit">+ New essay</button>
      </form>
      <ErrorText error={error} />
      {essays?.length === 0 && <p className="muted">No essays yet. Start one here or from a school’s requirement list.</p>}
      <table className="table">
        <tbody>
          {essays?.map((e) => (
            <tr key={e.id}>
              <td><Link to={`/essays/${e.id}`}>{e.title}</Link></td>
              <td className="muted small">{e.word_count} words</td>
              <td className="muted small">{e.assignments.map((a) => a.college_name).join(', ') || 'Not assigned'}</td>
              <td><StatusBadge status={e.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
