const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const { requireProjectMember } = require('../middleware/membership');
const { notify } = require('../utils/notify');
const { emitToProject } = require('../socket');

const router = express.Router();
router.use(authRequired);

function getTask(taskId) {
  return db
    .prepare(
      `SELECT t.*, a.name AS assignee_name, a.avatar_color AS assignee_color
       FROM tasks t LEFT JOIN users a ON a.id = t.assignee_id WHERE t.id = ?`
    )
    .get(taskId);
}

function projectIdForTask(req) {
  const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(req.params.taskId);
  return task?.project_id;
}

const VALID_STATUSES = ['todo', 'in_progress', 'done'];

// Create a task within a project
router.post('/project/:projectId', requireProjectMember((req) => req.params.projectId), (req, res) => {
  const { title, description, assignee_id, priority, due_date, status } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Task title is required' });

  if (assignee_id) {
    const isMember = db
      .prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(req.projectId, assignee_id);
    if (!isMember) return res.status(400).json({ error: 'Assignee must be a project member' });
  }

  const maxPos = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM tasks WHERE project_id = ? AND status = ?')
    .get(req.projectId, status || 'todo').m;

  const task = {
    id: uuidv4(),
    project_id: req.projectId,
    title: title.trim(),
    description: description?.trim() || null,
    status: VALID_STATUSES.includes(status) ? status : 'todo',
    priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
    assignee_id: assignee_id || null,
    created_by: req.user.id,
    due_date: due_date || null,
    position: maxPos + 1,
  };

  db.prepare(
    `INSERT INTO tasks (id, project_id, title, description, status, priority, assignee_id, created_by, due_date, position)
     VALUES (@id, @project_id, @title, @description, @status, @priority, @assignee_id, @created_by, @due_date, @position)`
  ).run(task);

  const full = getTask(task.id);
  emitToProject(req.projectId, 'task:created', full);

  if (task.assignee_id) {
    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(req.projectId);
    notify({
      userId: task.assignee_id,
      actorId: req.user.id,
      type: 'assigned',
      message: `${req.user.name} assigned you to "${task.title}" in ${project.name}`,
      projectId: req.projectId,
      taskId: task.id,
    });
  }

  res.status(201).json({ task: full });
});

// Update a task (title, description, status, priority, assignee, due date, position)
router.patch('/:taskId', (req, res, next) => {
  req.params.projectId = projectIdForTask(req);
  next();
}, requireProjectMember((req) => req.params.projectId), (req, res) => {
  const existing = getTask(req.params.taskId);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const { title, description, status, priority, assignee_id, due_date, position } = req.body;

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  if (assignee_id) {
    const isMember = db
      .prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(req.projectId, assignee_id);
    if (!isMember) return res.status(400).json({ error: 'Assignee must be a project member' });
  }

  const updated = {
    title: title !== undefined ? title.trim() : existing.title,
    description: description !== undefined ? description : existing.description,
    status: status || existing.status,
    priority: priority || existing.priority,
    assignee_id: assignee_id !== undefined ? assignee_id : existing.assignee_id,
    due_date: due_date !== undefined ? due_date : existing.due_date,
    position: position !== undefined ? position : existing.position,
  };

  db.prepare(
    `UPDATE tasks SET title = @title, description = @description, status = @status, priority = @priority,
     assignee_id = @assignee_id, due_date = @due_date, position = @position, updated_at = datetime('now')
     WHERE id = @id`
  ).run({ ...updated, id: req.params.taskId });

  const full = getTask(req.params.taskId);
  emitToProject(req.projectId, 'task:updated', full);

  const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(req.projectId);

  // Notify newly assigned user
  if (assignee_id && assignee_id !== existing.assignee_id) {
    notify({
      userId: assignee_id,
      actorId: req.user.id,
      type: 'assigned',
      message: `${req.user.name} assigned you to "${full.title}" in ${project.name}`,
      projectId: req.projectId,
      taskId: full.id,
    });
  }

  // Notify assignee (and creator) on status change, if someone else made it
  if (status && status !== existing.status) {
    const interested = new Set([existing.assignee_id, existing.created_by].filter(Boolean));
    interested.forEach((userId) => {
      notify({
        userId,
        actorId: req.user.id,
        type: 'status_change',
        message: `${req.user.name} moved "${full.title}" to ${status.replace('_', ' ')}`,
        projectId: req.projectId,
        taskId: full.id,
      });
    });
  }

  res.json({ task: full });
});

// Delete a task
router.delete('/:taskId', (req, res, next) => {
  req.params.projectId = projectIdForTask(req);
  next();
}, requireProjectMember((req) => req.params.projectId), (req, res) => {
  const existing = getTask(req.params.taskId);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.taskId);
  emitToProject(req.projectId, 'task:deleted', { id: req.params.taskId, project_id: req.projectId });
  res.json({ success: true });
});

// Get a single task (with comments) — useful for a task detail view
router.get('/:taskId', (req, res, next) => {
  req.params.projectId = projectIdForTask(req);
  next();
}, requireProjectMember((req) => req.params.projectId), (req, res) => {
  const task = getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const comments = db
    .prepare(
      `SELECT c.*, u.name AS author_name, u.avatar_color AS author_color
       FROM comments c JOIN users u ON u.id = c.author_id
       WHERE c.task_id = ? ORDER BY c.created_at ASC`
    )
    .all(req.params.taskId);

  res.json({ task, comments });
});

module.exports = router;
