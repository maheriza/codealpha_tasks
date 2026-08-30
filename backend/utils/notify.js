const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { emitToUser } = require('../socket');

// Creates a notification row and pushes it in real time to the target user
// (if they're currently connected). Never notifies a user about their own action.
function notify({ userId, actorId, type, message, projectId = null, taskId = null }) {
  if (userId === actorId) return;

  const notification = {
    id: uuidv4(),
    user_id: userId,
    type,
    message,
    project_id: projectId,
    task_id: taskId,
    is_read: 0,
    created_at: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO notifications (id, user_id, type, message, project_id, task_id, is_read)
     VALUES (@id, @user_id, @type, @message, @project_id, @task_id, @is_read)`
  ).run(notification);

  emitToUser(userId, 'notification:new', notification);
}

module.exports = { notify };
