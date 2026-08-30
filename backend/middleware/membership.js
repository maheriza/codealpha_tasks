const db = require('../db');

// Ensures req.user is a member (or owner) of the project referenced by
// req.params.projectId (or resolved from a task/comment id).
function requireProjectMember(getProjectId) {
  return (req, res, next) => {
    const projectId = getProjectId(req);
    if (!projectId) return res.status(404).json({ error: 'Project not found' });

    const membership = db
      .prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(projectId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this project' });
    }

    req.projectId = projectId;
    req.membership = membership;
    next();
  };
}

module.exports = { requireProjectMember };
