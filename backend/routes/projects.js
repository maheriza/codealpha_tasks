const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const { requireProjectMember } = require('../middleware/membership');
const { notify } = require('../utils/notify');
const { emitToProject } = require('../socket');

const router = express.Router();
router.use(authRequired);

function getMembers(projectId) {
  return db
    .prepare(
      `SELECT u.id, u.name, u.email, u.avatar_color, pm.role
       FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ? ORDER BY pm.joined_at ASC`
    )
    .all(projectId);
}

// List all projects the current user belongs to
router.get('/', (req, res) => {
  const projects = db
    .prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       WHERE pm.user_id = ?
       ORDER BY p.created_at DESC`
    )
    .all(req.user.id);

  res.json({ projects });
});

// Create a project (creator becomes owner + member)
router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Project name is required' });

  const project = {
    id: uuidv4(),
    name: name.trim(),
    description: description?.trim() || null,
    owner_id: req.user.id,
  };

  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, description, owner_id) VALUES (@id, @name, @description, @owner_id)`
  );
  const insertMember = db.prepare(
    `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'owner')`
  );

  db.transaction(() => {
    insertProject.run(project);
    insertMember.run(project.id, req.user.id);
  })();

  res.status(201).json({ project: { ...project, members: getMembers(project.id) } });
});

// Get a single project with members + tasks
router.get('/:projectId', requireProjectMember((req) => req.params.projectId), (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.projectId);
  const tasks = db
    .prepare(
      `SELECT t.*, a.name AS assignee_name, a.avatar_color AS assignee_color
       FROM tasks t LEFT JOIN users a ON a.id = t.assignee_id
       WHERE t.project_id = ? ORDER BY t.status, t.position ASC`
    )
    .all(req.projectId);

  res.json({ project: { ...project, members: getMembers(req.projectId), tasks } });
});

// Update project name/description (owner only)
router.patch('/:projectId', requireProjectMember((req) => req.params.projectId), (req, res) => {
  if (req.membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only the project owner can edit project details' });
  }
  const { name, description } = req.body;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.projectId);

  const updated = {
    name: name?.trim() || project.name,
    description: description !== undefined ? description : project.description,
  };

  db.prepare('UPDATE projects SET name = ?, description = ? WHERE id = ?').run(
    updated.name,
    updated.description,
    req.projectId
  );

  const fresh = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.projectId);
  emitToProject(req.projectId, 'project:updated', fresh);
  res.json({ project: fresh });
});

// Invite / add a member by email
router.post('/:projectId/members', requireProjectMember((req) => req.params.projectId), (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(404).json({ error: 'No user found with that email' });

  const already = db
    .prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(req.projectId, user.id);
  if (already) return res.status(409).json({ error: 'User is already a member of this project' });

  db.prepare(`INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'member')`).run(
    req.projectId,
    user.id
  );

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.projectId);
  const members = getMembers(req.projectId);

  emitToProject(req.projectId, 'project:member_added', { projectId: req.projectId, members });
  notify({
    userId: user.id,
    actorId: req.user.id,
    type: 'invited',
    message: `${req.user.name} added you to "${project.name}"`,
    projectId: req.projectId,
  });

  res.status(201).json({ members });
});

// Remove a member (owner only, cannot remove self/owner)
router.delete('/:projectId/members/:userId', requireProjectMember((req) => req.params.projectId), (req, res) => {
  if (req.membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only the project owner can remove members' });
  }
  if (req.params.userId === req.user.id) {
    return res.status(400).json({ error: 'Owner cannot remove themselves' });
  }

  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(
    req.projectId,
    req.params.userId
  );

  const members = getMembers(req.projectId);
  emitToProject(req.projectId, 'project:member_removed', { projectId: req.projectId, members });
  res.json({ members });
});

module.exports = router;
