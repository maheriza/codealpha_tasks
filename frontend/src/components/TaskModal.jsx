import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export default function TaskModal({ task, members, onClose, onUpdated, onDeleted }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [assigneeId, setAssigneeId] = useState(task.assignee_id || '');
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(task.due_date || '');
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/comments/task/${task.id}`).then(({ data }) => setComments(data.comments));
  }, [task.id]);

  useEffect(() => {
    if (!socket) return;
    const onNewComment = (c) => {
      if (c.task_id === task.id) setComments((prev) => [...prev, c]);
    };
    const onDeleteComment = ({ id, task_id }) => {
      if (task_id === task.id) setComments((prev) => prev.filter((c) => c.id !== id));
    };
    socket.on('comment:created', onNewComment);
    socket.on('comment:deleted', onDeleteComment);
    return () => {
      socket.off('comment:created', onNewComment);
      socket.off('comment:deleted', onDeleteComment);
    };
  }, [socket, task.id]);

  async function saveField(patch) {
    setSaving(true);
    try {
      const { data } = await api.patch(`/tasks/${task.id}`, patch);
      onUpdated(data.task);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this task? This cannot be undone.')) return;
    await api.delete(`/tasks/${task.id}`);
    onDeleted(task.id);
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!newComment.trim()) return;
    const body = newComment;
    setNewComment('');
    const { data } = await api.post(`/comments/task/${task.id}`, { body });
    setComments((prev) => (prev.some((c) => c.id === data.comment.id) ? prev : [...prev, data.comment]));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card task-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <input
            className="task-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && saveField({ title })}
          />
          <button className="link-btn danger" onClick={handleDelete}>Delete</button>
        </div>

        <div className="task-modal-grid">
          <div className="task-modal-field">
            <label>Status</label>
            <select value={task.status} onChange={(e) => saveField({ status: e.target.value })}>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </div>
          <div className="task-modal-field">
            <label>Priority</label>
            <select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                saveField({ priority: e.target.value });
              }}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="task-modal-field">
            <label>Assignee</label>
            <select
              value={assigneeId}
              onChange={(e) => {
                setAssigneeId(e.target.value);
                saveField({ assignee_id: e.target.value || null });
              }}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="task-modal-field">
            <label>Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                saveField({ due_date: e.target.value || null });
              }}
            />
          </div>
        </div>

        <label>Description</label>
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (task.description || '') && saveField({ description })}
          placeholder="Add more detail…"
        />

        <div className="comments-section">
          <h3>Comments</h3>
          <div className="comments-list">
            {comments.length === 0 && <p className="muted">No comments yet — start the conversation.</p>}
            {comments.map((c) => (
              <div key={c.id} className="comment">
                <div className="mini-avatar" style={{ background: c.author_color }}>
                  {c.author_name[0]?.toUpperCase()}
                </div>
                <div className="comment-body">
                  <div className="comment-meta">
                    <strong>{c.author_name}</strong>
                    <span>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <div>{c.body}</div>
                </div>
              </div>
            ))}
          </div>
          <form className="comment-form" onSubmit={submitComment}>
            <input
              placeholder={`Comment as ${user.name}…`}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
            <button type="submit">Send</button>
          </form>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {saving ? 'Saving…' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
