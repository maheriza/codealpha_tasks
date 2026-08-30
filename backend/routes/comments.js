const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const { requireProjectMember } = require('../middleware/membership');
const { notify } = require('../utils/notify');
const { emitToProject } = require('../socket');

const router = express.Router();
router.use(authRequired);

function projectIdForTask(taskId) {
  const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId);
  return task?.project_id;
}

// List comments for a task
router.get('/task/:taskId', (req, res, next) => {
  req.params.projectId = projectIdForTask(req.params.taskId);
  next();
}, requireProjectMember((req) => req.params.projectId), (req, res) => {
  const comments = db
    .prepare(
      `SELECT c.*, u.name AS author_name, u.avatar_color AS author_color
       FROM comments c JOIN users u ON u.id = c.author_id
       WHERE c.task_id = ? ORDER BY c.created_at ASC`
    )
    .all(req.params.taskId);

  res.json({ comments });
});

// Add a comment to a task
router.post('/task/:taskId', (req, res, next) => {
  req.params.projectId = projectIdForTask(req.params.taskId);
  next();
}, requireProjectMember((req) => req.params.projectId), (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body is required' });

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const comment = {
    id: uuidv4(),
    task_id: req.params.taskId,
    author_id: req.user.id,
    body: body.trim(),
  };

  db.prepare(`INSERT INTO comments (id, task_id, author_id, body) VALUES (@id, @task_id, @author_id, @body)`).run(
    comment
  );

  const full = db
    .prepare(
      `SELECT c.*, u.name AS author_name, u.avatar_color AS author_color
       FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?`
    )
    .get(comment.id);

  emitToProject(req.projectId, 'comment:created', full);

  // Notify assignee + creator (anyone "involved" in the task) except the commenter
  const interested = new Set([task.assignee_id, task.created_by].filter(Boolean));
  interested.forEach((userId) => {
    notify({
      userId,
      actorId: req.user.id,
      type: 'comment',
      message: `${req.user.name} commented on "${task.title}"`,
      projectId: req.projectId,
      taskId: task.id,
    });
  });

  res.status(201).json({ comment: full });
});

// Delete own comment
router.delete('/:commentId', (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.author_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own comments' });
  }

  const projectId = projectIdForTask(comment.task_id);
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.commentId);
  emitToProject(projectId, 'comment:deleted', { id: req.params.commentId, task_id: comment.task_id });

  res.json({ success: true });
});

module.exports = router;
