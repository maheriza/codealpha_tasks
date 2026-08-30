require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');

const { initSocket } = require('./socket');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const commentRoutes = require('./routes/comments');
const notificationRoutes = require('./routes/notifications');

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5174';

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);

// Fallback 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Generic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

initSocket(server, CLIENT_URL);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`API + WebSocket server running on http://localhost:${PORT}`);
});
