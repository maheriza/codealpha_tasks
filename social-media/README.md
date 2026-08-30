# Mini Social — Full-Stack Social Media App (Python / Flask version)

Run it with a single command: **`python app.py`**

- **Frontend:** HTML, CSS, vanilla JavaScript (no build step)
- **Backend:** Flask (Python) — one file, `backend/app.py`
- **Database:** SQLite (Python's built-in `sqlite3` module) — a single file, zero setup
- **Auth:** JWT tokens (PyJWT) + password hashing (Werkzeug's `generate_password_hash`)

This is a Python port of the same app — same features, same API, same frontend.
If you previously got the Node/Express version, this one replaces that backend
so you can run everything with plain Python instead of Node.

## Features

- Register / log in (JWT-based auth)
- User profiles: bio, avatar (by URL), post count, follower/following counts
- Create, view, and delete posts (text + optional image URL)
- Comment on posts, delete your own comments
- Like / unlike posts
- Follow / unfollow other users
- Two feeds: **Explore** (all posts) and **Following** (posts from people you follow)
- User search
- Followers / following list modals

## Project Structure

```
social-app-flask/
├── backend/
│   ├── app.py            # Flask app — routes, DB schema, JWT auth, all in one file
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js
```

## Setup & Run

**Requirements:** Python 3.8+

```bash
cd backend
pip install -r requirements.txt
python app.py
```

The server starts on **http://localhost:5000** and serves the frontend
directly too (Flask serves the `frontend/` folder as static files), so just
open **http://localhost:5000** in your browser — nothing else to run.

The SQLite database file (`social_app.db`) is created automatically in
`backend/` the first time you start the server.

To use a different port, set the `PORT` environment variable:

```bash
PORT=8000 python app.py
```

## API Overview

Same endpoints as the Express version — the frontend talks to them exactly
the same way, via `/api/...` on the same origin.

| Method | Endpoint                        | Description                       | Auth |
|--------|----------------------------------|------------------------------------|------|
| POST   | /api/auth/register               | Create account                     | No   |
| POST   | /api/auth/login                  | Log in                             | No   |
| GET    | /api/users?q=                    | List / search users                | No   |
| GET    | /api/users/:id                   | Get profile                        | No   |
| PUT    | /api/users/me/update              | Update own bio/avatar              | Yes  |
| POST   | /api/users/:id/follow            | Follow a user                      | Yes  |
| DELETE | /api/users/:id/follow            | Unfollow a user                    | Yes  |
| GET    | /api/users/:id/followers          | List followers                     | No   |
| GET    | /api/users/:id/following          | List following                     | No   |
| GET    | /api/posts                       | Global feed                        | No   |
| GET    | /api/posts/feed                  | Feed from followed users           | Yes  |
| GET    | /api/posts/user/:id               | Posts by a user                    | No   |
| GET    | /api/posts/:id                   | Single post                        | No   |
| POST   | /api/posts                       | Create post                        | Yes  |
| DELETE | /api/posts/:id                   | Delete own post                    | Yes  |
| POST   | /api/posts/:id/like               | Like a post                        | Yes  |
| DELETE | /api/posts/:id/like               | Unlike a post                      | Yes  |
| GET    | /api/posts/:id/comments           | List comments on a post            | No   |
| POST   | /api/posts/:id/comments           | Add a comment                      | Yes  |
| DELETE | /api/posts/comments/:commentId    | Delete own comment                 | Yes  |

Authenticated requests need header: `Authorization: Bearer <token>`
(the token returned from register/login).

## Notes

- This was tested end-to-end (register, login, posting, following, liking,
  commenting, both feeds, static file serving) and works correctly.
- Runs with Flask's built-in dev server (`debug=True`) — fine for local use
  and demos. For production, put it behind a real WSGI server (gunicorn,
  waitress, etc.) and turn debug mode off.
- Passwords are hashed with Werkzeug's PBKDF2-based hasher; never stored
  in plain text.
- Next steps for a production version: rate limiting, stronger validation,
  refresh tokens, real image uploads, and pagination on feeds.
