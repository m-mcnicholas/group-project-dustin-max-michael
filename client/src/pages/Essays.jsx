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
      <header className="page-header">
        <div>
          <h1>Essays</h1>
          <p className="muted">One essay can cover several prompts. Finish one and we’ll look for others it could reuse.</p>
        </div>
      </header>
      <form className="new-essay" onSubmit={create}>
        <input placeholder="New essay title…" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <button type="submit">+ New essay</button>
      </form>
      <ErrorText error={error} />
      {essays?.length === 0 && <p className="muted">No essays yet. Start one here or from a school’s requirement list.</p>}
      <div className="essay-list">
        {essays?.map((e) => (
          <Link key={e.id} to={`/essays/${e.id}`} className="card essay-row">
            <div>
              <div className="title">{e.title}</div>
              <div className="muted small assigned-to">{e.assignments.map((a) => a.college_name).join(', ') || 'Not assigned to a prompt'}</div>
            </div>
            <span className="muted small nowrap">{e.word_count} words</span>
            <StatusBadge status={e.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
