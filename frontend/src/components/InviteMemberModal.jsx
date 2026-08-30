import { useState } from 'react';
import api from '../api';

export default function InviteMemberModal({ projectId, onClose, onInvited }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/projects/${projectId}/members`, { email });
      onInvited(data.members);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add member');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Invite a collaborator</h2>
        {error && <div className="alert-error">{error}</div>}
        <label>Email address</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
        <p className="muted">They must already have a Boardly account.</p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add member'}</button>
        </div>
      </form>
    </div>
  );
}
