# Boardly — Collaborative Project Management Tool

A full-stack Trello/Asana-style app: users create projects, add teammates,
organize work on a Kanban board (To Do / In Progress / Done), assign tasks,
and discuss them in threaded comments — all synced live across every open
tab via WebSockets, plus a real-time notification bell.

## Stack

- **Backend:** Node.js, Express, SQLite (via `better-sqlite3` — zero setup,
  no external DB server needed), JWT auth, bcrypt password hashing,
  Socket.IO for real-time events.
- **Frontend:** React 18 (Vite), React Router, Axios, Socket.IO client.
  Plain CSS — no UI framework dependency.

## Features

- **Auth:** register / login with JWT, protected routes.
- **Projects:** create projects, invite teammates by email, per-project
  membership (owner vs. member).
- **Boards:** drag-and-drop Kanban board with 3 columns; create, edit,
  reassign, reprioritize, and delete tasks.
- **Comments:** threaded discussion on every task.
- **Notifications:** in-app bell + live push (via WebSockets) when you're
  assigned a task, someone comments on a task you're involved in, or a
  task's status changes.
- **Real-time sync:** every board, task, and comment update is broadcast
  instantly to everyone viewing that project — no refresh needed.

## Project structure

```
pm-tool/
├── backend/
│   ├── db/            # SQLite schema + seed script (db.sqlite created on first run)
│   ├── middleware/     # JWT auth guard, project-membership guard
│   ├── routes/         # auth, projects, tasks, comments, notifications
│   ├── utils/notify.js # creates + emits notifications
│   ├── socket.js        # Socket.IO server + auth
│   └── server.js         # Express app entry point
└── frontend/
    └── src/
        ├── context/     # AuthContext, SocketContext
        ├── pages/        # Login, Register, Dashboard, ProjectBoard
        └── components/    # TaskCard, TaskModal, Notifications, modals
```

## Getting started

Requires Node.js 18+.

### 1. Backend

```bash
cd backend
cp .env.example .env      # edit JWT_SECRET if you like
npm install
npm run dev                # starts on http://localhost:4000
```

This creates `backend/db/pm-tool.db` automatically on first run — no
database server or migrations needed.

Optional: seed some demo data (3 users, 1 project, a few tasks):

```bash
npm run seed
```
Demo logins: `alex@demo.com` / `priya@demo.com` / `sam@demo.com`, all with
password `password123`.

### 2. Frontend

In a second terminal:

```bash
cd frontend
cp .env.example .env      # points at http://localhost:4000 by default
npm install
npm run dev                 # starts on http://localhost:5173
```

Open `http://localhost:5173`, register an account (or use a seeded demo
account), create a project, invite a teammate by email, and start adding
tasks. Open the app in two browser windows logged in as two different
users to see the real-time sync and notifications in action.

## How the real-time layer works

- The Socket.IO server (`backend/socket.js`) authenticates each socket
  connection with the same JWT used for REST calls.
- Every connected client automatically joins a personal room
  (`user:<id>`) for direct notifications, and joins a `project:<id>` room
  while viewing that project's board.
- Any task/comment/project change made through the REST API triggers a
  broadcast (`emitToProject`) to everyone on that board, and a targeted
  notification (`emitToUser`) to anyone who should know about it
  (assignee, task creator, invited member) — stored in the database and
  pushed live if they're online.

## API overview

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Log in |
| GET | `/api/auth/me` | Current user |
| GET | `/api/projects` | List my projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Project + members + tasks |
| POST | `/api/projects/:id/members` | Invite member by email |
| POST | `/api/tasks/project/:id` | Create task |
| PATCH | `/api/tasks/:id` | Update task (status, assignee, etc.) |
| DELETE | `/api/tasks/:id` | Delete task |
| GET/POST | `/api/comments/task/:id` | List / add comments |
| GET | `/api/notifications` | List my notifications |
| PATCH | `/api/notifications/:id/read` | Mark one read |

## Notes / next steps if you extend this

- Swap `better-sqlite3` for Postgres by replacing `backend/db/index.js` —
  the route files use plain SQL so the change is localized.
- Add file attachments on tasks (multer + local/S3 storage).
- Add due-date reminder emails/cron.
- Add a "my tasks" cross-project view.
