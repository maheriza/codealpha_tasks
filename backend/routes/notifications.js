const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// List notifications for the current user (most recent first)
router.get('/', (req, res) => {
  const notifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user.id);

  const unreadCount = db
    .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(req.user.id).c;

  res.json({ notifications, unreadCount });
});

// Mark one notification as read
router.patch('/:id/read', (req, res) => {
  const result = db
    .prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Notification not found' });
  res.json({ success: true });
});

// Mark all as read
router.patch('/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ success: true });
});

module.exports = router;
