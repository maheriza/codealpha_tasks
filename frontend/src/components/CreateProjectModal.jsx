import { useState } from 'react';
import api from '../api';

export default function CreateProjectModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/projects', { name, description });
      onCreated(data.project);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create project');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>New project</h2>
        {error && <div className="alert-error">{error}</div>}
        <label>Project name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        <label>Description (optional)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </div>
  );
}
