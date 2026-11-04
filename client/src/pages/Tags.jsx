import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorText, TagChip } from '../components/ui.jsx';

export default function Tags() {
  const [tags, setTags] = useState([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2563eb');
  const [error, setError] = useState(null);

  useEffect(() => {
    api.tags().then((d) => setTags(d.tags)).catch(setError);
  }, []);

  const run = async (p) => {
    setError(null);
    try {
      setTags((await p).tags);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="page">
      <h1>Tags</h1>
      <p className="muted">Label schools however you like (“reach”, “safety”, “dream”…), then filter your dashboard by tag.</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          run(api.createTag(name, color)).then(() => setName(''));
        }}
      >
        <input placeholder="Tag name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <button type="submit">Add tag</button>
      </form>
      <ErrorText error={error} />
      <ul className="checklist">
        {tags.map((t) => (
          <li key={t.id} className="row">
            <TagChip tag={t} />
            <input
              defaultValue={t.name}
              onBlur={(e) => e.target.value !== t.name && run(api.updateTag(t.id, { name: e.target.value }))}
            />
            <input type="color" defaultValue={t.color} onChange={(e) => run(api.updateTag(t.id, { color: e.target.value }))} />
            <span className="spacer" />
            <button className="link danger" onClick={() => run(api.deleteTag(t.id))}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
