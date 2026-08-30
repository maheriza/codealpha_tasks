// Optional: populates the database with a demo user, project, and tasks.
// Run with: npm run seed
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./index');

const demoUsers = [
  { name: 'Alex Kim', email: 'alex@demo.com' },
  { name: 'Priya Nair', email: 'priya@demo.com' },
  { name: 'Sam Ortiz', email: 'sam@demo.com' },
];
const COLORS = ['#F87171', '#34D399', '#818CF8'];
const password_hash = bcrypt.hashSync('password123', 10);

const userIds = demoUsers.map((u, i) => {
  const id = uuidv4();
  db.prepare(
    'INSERT OR IGNORE INTO users (id, name, email, password_hash, avatar_color) VALUES (?, ?, ?, ?, ?)'
  ).run(id, u.name, u.email, password_hash, COLORS[i]);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
  return existing.id;
});

const projectId = uuidv4();
db.prepare('INSERT INTO projects (id, name, description, owner_id) VALUES (?, ?, ?, ?)').run(
  projectId,
  'Website Relaunch',
  'Redesign and relaunch the marketing site',
  userIds[0]
);

userIds.forEach((uid, i) => {
  db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(
    projectId,
    uid,
    i === 0 ? 'owner' : 'member'
  );
});

const tasks = [
  { title: 'Wireframe homepage', status: 'todo', assignee: userIds[1], priority: 'high' },
  { title: 'Set up CI pipeline', status: 'in_progress', assignee: userIds[2], priority: 'medium' },
  { title: 'Write launch announcement', status: 'done', assignee: userIds[0], priority: 'low' },
];

tasks.forEach((t, i) => {
  db.prepare(
    `INSERT INTO tasks (id, project_id, title, status, priority, assignee_id, created_by, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(uuidv4(), projectId, t.title, t.status, t.priority, t.assignee, userIds[0], i);
});

console.log('Seed complete. Demo accounts (password: password123):');
demoUsers.forEach((u) => console.log(`  ${u.email}`));
