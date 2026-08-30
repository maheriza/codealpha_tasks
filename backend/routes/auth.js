const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

const COLORS = ['#F87171', '#FB923C', '#FBBF24', '#34D399', '#22D3EE', '#818CF8', '#F472B6', '#A78BFA'];
function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, avatar_color: u.avatar_color };
}

router.post('/register', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const user = {
    id: uuidv4(),
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password_hash: bcrypt.hashSync(password, 10),
    avatar_color: randomColor(),
  };

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, avatar_color) VALUES (@id, @name, @email, @password_hash, @avatar_color)`
  ).run(user);

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

// Lightweight lookup used when inviting collaborators by email
router.get('/users/search', authRequired, (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (q.length < 2) return res.json({ users: [] });

  const users = db
    .prepare('SELECT id, name, email, avatar_color FROM users WHERE lower(email) LIKE ? OR lower(name) LIKE ? LIMIT 10')
    .all(`%${q}%`, `%${q}%`);

  res.json({ users });
});

module.exports = router;
