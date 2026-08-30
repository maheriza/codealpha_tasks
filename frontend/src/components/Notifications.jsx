import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useSocket } from '../context/SocketContext';

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const { socket } = useSocket();
  const navigate = useNavigate();

  async function load() {
    const { data } = await api.get('/notifications');
    setItems(data.notifications);
    setUnread(data.unreadCount);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = (notification) => {
      setItems((prev) => [notification, ...prev].slice(0, 50));
      setUnread((n) => n + 1);
    };
    socket.on('notification:new', handler);
    return () => socket.off('notification:new', handler);
  }, [socket]);

  async function markAllRead() {
    await api.patch('/notifications/read-all');
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
  }

  async function handleClick(n) {
    if (!n.is_read) {
      await api.patch(`/notifications/${n.id}/read`);
      setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, is_read: 1 } : it)));
      setUnread((count) => Math.max(0, count - 1));
    }
    setOpen(false);
    if (n.project_id) navigate(`/projects/${n.project_id}`);
  }

  return (
    <div className="notif-wrapper">
      <button className="notif-bell" onClick={() => setOpen((o) => !o)}>
        🔔
        {unread > 0 && <span className="notif-badge">{unread}</span>}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button className="link-btn" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <div className="notif-list">
            {items.length === 0 && <div className="notif-empty">No notifications yet</div>}
            {items.map((n) => (
              <div
                key={n.id}
                className={`notif-item ${n.is_read ? '' : 'unread'}`}
                onClick={() => handleClick(n)}
              >
                <div className="notif-message">{n.message}</div>
                <div className="notif-time">{new Date(n.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
