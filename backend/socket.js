const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io = null;

function initSocket(httpServer, clientUrl) {
  io = new Server(httpServer, {
    cors: {
      origin: clientUrl || '*',
      methods: ['GET', 'POST'],
    },
  });

  // Authenticate every socket connection using the same JWT as the REST API
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = payload;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    // Personal room, used for direct notifications
    socket.join(`user:${socket.user.id}`);

    // Client asks to join a project's room to receive board updates
    socket.on('project:join', (projectId) => {
      if (projectId) socket.join(`project:${projectId}`);
    });

    socket.on('project:leave', (projectId) => {
      if (projectId) socket.leave(`project:${projectId}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

// Broadcast a board event (task created/updated/deleted, comment added) to
// everyone currently viewing that project.
function emitToProject(projectId, event, payload) {
  if (!io) return;
  io.to(`project:${projectId}`).emit(event, payload);
}

// Push a real-time notification to one specific user.
function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

module.exports = { initSocket, getIO, emitToProject, emitToUser };
