import { useState } from 'react';
import api from '../api';

export default function AddTaskForm({ projectId, status, onCreated, onCancel }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/tasks/project/${projectId}`, { title, status });
      onCreated(data.task);
      setTitle('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="add-task-form" onSubmit={handleSubmit}>
      <input
        autoFocus
        placeholder="Task title…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <div className="add-task-actions">
        <button type="submit" disabled={busy}>Add</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
