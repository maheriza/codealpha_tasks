"""
Mini Social — Flask backend (app.py)

Run with:
    pip install -r requirements.txt
    python app.py

Serves the API at /api/* and the frontend (static files) at /
so you only need to open http://localhost:5000
"""

import os
import sqlite3
import datetime
from functools import wraps

import jwt
from flask import Flask, request, jsonify, g, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "social_app.db")
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")

SECRET_KEY = os.environ.get("JWT_SECRET", "change_this_secret_in_production")
PORT = int(os.environ.get("PORT", 5000))
TOKEN_EXPIRY_DAYS = 7

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")


# ---------------------------------------------------------------------------
# CORS (manual, so we don't depend on flask-cors)
# ---------------------------------------------------------------------------
@app.after_request
def add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return resp


@app.route("/api/<path:_any>", methods=["OPTIONS"])
def cors_preflight(_any):
    return "", 204


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT UNIQUE NOT NULL,
            email         TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            bio           TEXT DEFAULT '',
            avatar_url    TEXT DEFAULT '',
            created_at    TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS posts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            content     TEXT NOT NULL,
            image_url   TEXT DEFAULT '',
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS comments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id     INTEGER NOT NULL,
            user_id     INTEGER NOT NULL,
            content     TEXT NOT NULL,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS likes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id     INTEGER NOT NULL,
            user_id     INTEGER NOT NULL,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(post_id, user_id),
            FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS follows (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            follower_id   INTEGER NOT NULL,
            following_id  INTEGER NOT NULL,
            created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(follower_id, following_id),
            FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """
    )
    conn.commit()
    conn.close()


def row_to_dict(row):
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def make_token(user_id):
    payload = {
        "id": user_id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=TOKEN_EXPIRY_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def decode_token(token):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return payload.get("id")
    except jwt.PyJWTError:
        return None


def get_bearer_token():
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header.split(" ", 1)[1]
    return None


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = get_bearer_token()
        if not token:
            return jsonify({"error": "No token provided"}), 401
        user_id = decode_token(token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token"}), 403
        g.user_id = user_id
        return fn(*args, **kwargs)
    return wrapper


def auth_optional(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = get_bearer_token()
        g.user_id = decode_token(token) if token else None
        return fn(*args, **kwargs)
    return wrapper


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------
def public_user(user_id, viewer_id=None):
    db = get_db()
    user = db.execute(
        "SELECT id, username, email, bio, avatar_url, created_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if not user:
        return None

    followers = db.execute(
        "SELECT COUNT(*) c FROM follows WHERE following_id = ?", (user_id,)
    ).fetchone()["c"]
    following = db.execute(
        "SELECT COUNT(*) c FROM follows WHERE follower_id = ?", (user_id,)
    ).fetchone()["c"]
    post_count = db.execute(
        "SELECT COUNT(*) c FROM posts WHERE user_id = ?", (user_id,)
    ).fetchone()["c"]

    is_following = False
    if viewer_id:
        is_following = (
            db.execute(
                "SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?",
                (viewer_id, user_id),
            ).fetchone()
            is not None
        )

    data = row_to_dict(user)
    data.update(
        followers=followers,
        following=following,
        postCount=post_count,
        isFollowing=is_following,
    )
    return data


def enrich_post(post_row, viewer_id=None):
    db = get_db()
    post = row_to_dict(post_row)
    author = row_to_dict(
        db.execute(
            "SELECT id, username, avatar_url FROM users WHERE id = ?",
            (post["user_id"],),
        ).fetchone()
    )
    like_count = db.execute(
        "SELECT COUNT(*) c FROM likes WHERE post_id = ?", (post["id"],)
    ).fetchone()["c"]
    comment_count = db.execute(
        "SELECT COUNT(*) c FROM comments WHERE post_id = ?", (post["id"],)
    ).fetchone()["c"]
    liked_by_me = False
    if viewer_id:
        liked_by_me = (
            db.execute(
                "SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?",
                (post["id"], viewer_id),
            ).fetchone()
            is not None
        )

    post["author"] = author
    post["likeCount"] = like_count
    post["commentCount"] = comment_count
    post["likedByMe"] = liked_by_me
    return post


# ===========================================================================
# Auth routes
# ===========================================================================
@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    bio = (data.get("bio") or "").strip()

    if not username or not email or not password:
        return jsonify({"error": "username, email, and password are required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ? OR email = ?", (username, email)
    ).fetchone()
    if existing:
        return jsonify({"error": "Username or email already in use"}), 409

    password_hash = generate_password_hash(password)
    cur = db.execute(
        "INSERT INTO users (username, email, password_hash, bio) VALUES (?, ?, ?, ?)",
        (username, email, password_hash, bio),
    )
    db.commit()
    user_id = cur.lastrowid

    user = public_user(user_id)
    token = make_token(user_id)
    return jsonify({"user": user, "token": token}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE username = ? OR email = ?", (username, username)
    ).fetchone()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    token = make_token(user["id"])
    return jsonify({"user": public_user(user["id"]), "token": token})


# ===========================================================================
# User routes
# ===========================================================================
@app.get("/api/users")
@auth_optional
def list_users():
    db = get_db()
    q = request.args.get("q")
    if q:
        rows = db.execute(
            "SELECT id, username, bio, avatar_url FROM users WHERE username LIKE ? LIMIT 20",
            (f"%{q}%",),
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT id, username, bio, avatar_url FROM users ORDER BY id DESC LIMIT 20"
        ).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.get("/api/users/<int:user_id>")
@auth_optional
def get_user(user_id):
    user = public_user(user_id, g.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user)


@app.put("/api/users/me/update")
@auth_required
def update_me():
    data = request.get_json(silent=True) or {}
    bio = data.get("bio")
    avatar_url = data.get("avatar_url")
    db = get_db()
    db.execute(
        "UPDATE users SET bio = COALESCE(?, bio), avatar_url = COALESCE(?, avatar_url) WHERE id = ?",
        (bio, avatar_url, g.user_id),
    )
    db.commit()
    return jsonify(public_user(g.user_id, g.user_id))


@app.post("/api/users/<int:target_id>/follow")
@auth_required
def follow_user(target_id):
    if target_id == g.user_id:
        return jsonify({"error": "You cannot follow yourself"}), 400

    db = get_db()
    target = db.execute("SELECT id FROM users WHERE id = ?", (target_id,)).fetchone()
    if not target:
        return jsonify({"error": "User not found"}), 404

    try:
        db.execute(
            "INSERT INTO follows (follower_id, following_id) VALUES (?, ?)",
            (g.user_id, target_id),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Already following"}), 409

    return jsonify({"message": "Followed successfully"})


@app.delete("/api/users/<int:target_id>/follow")
@auth_required
def unfollow_user(target_id):
    db = get_db()
    db.execute(
        "DELETE FROM follows WHERE follower_id = ? AND following_id = ?",
        (g.user_id, target_id),
    )
    db.commit()
    return jsonify({"message": "Unfollowed successfully"})


@app.get("/api/users/<int:user_id>/followers")
def list_followers(user_id):
    db = get_db()
    rows = db.execute(
        """
        SELECT u.id, u.username, u.bio, u.avatar_url
        FROM follows f JOIN users u ON u.id = f.follower_id
        WHERE f.following_id = ?
        ORDER BY f.created_at DESC
        """,
        (user_id,),
    ).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.get("/api/users/<int:user_id>/following")
def list_following(user_id):
    db = get_db()
    rows = db.execute(
        """
        SELECT u.id, u.username, u.bio, u.avatar_url
        FROM follows f JOIN users u ON u.id = f.following_id
        WHERE f.follower_id = ?
        ORDER BY f.created_at DESC
        """,
        (user_id,),
    ).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


# ===========================================================================
# Post routes
# ===========================================================================
@app.get("/api/posts")
@auth_optional
def global_feed():
    db = get_db()
    rows = db.execute("SELECT * FROM posts ORDER BY created_at DESC LIMIT 50").fetchall()
    return jsonify([enrich_post(r, g.user_id) for r in rows])


@app.get("/api/posts/feed")
@auth_required
def following_feed():
    db = get_db()
    rows = db.execute(
        """
        SELECT p.* FROM posts p
        WHERE p.user_id = ?
           OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
        ORDER BY p.created_at DESC
        LIMIT 50
        """,
        (g.user_id, g.user_id),
    ).fetchall()
    return jsonify([enrich_post(r, g.user_id) for r in rows])


@app.get("/api/posts/user/<int:user_id>")
@auth_optional
def posts_by_user(user_id):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC", (user_id,)
    ).fetchall()
    return jsonify([enrich_post(r, g.user_id) for r in rows])


@app.get("/api/posts/<int:post_id>")
@auth_optional
def get_post(post_id):
    db = get_db()
    row = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if not row:
        return jsonify({"error": "Post not found"}), 404
    return jsonify(enrich_post(row, g.user_id))


@app.post("/api/posts")
@auth_required
def create_post():
    data = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    image_url = (data.get("image_url") or "").strip()
    if not content:
        return jsonify({"error": "Post content is required"}), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO posts (user_id, content, image_url) VALUES (?, ?, ?)",
        (g.user_id, content, image_url),
    )
    db.commit()
    row = db.execute("SELECT * FROM posts WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(enrich_post(row, g.user_id)), 201


@app.delete("/api/posts/<int:post_id>")
@auth_required
def delete_post(post_id):
    db = get_db()
    post = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if not post:
        return jsonify({"error": "Post not found"}), 404
    if post["user_id"] != g.user_id:
        return jsonify({"error": "Not authorized"}), 403
    db.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    db.commit()
    return jsonify({"message": "Post deleted"})


@app.post("/api/posts/<int:post_id>/like")
@auth_required
def like_post(post_id):
    db = get_db()
    post = db.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
    if not post:
        return jsonify({"error": "Post not found"}), 404
    try:
        db.execute(
            "INSERT INTO likes (post_id, user_id) VALUES (?, ?)", (post_id, g.user_id)
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Already liked"}), 409
    return jsonify({"message": "Liked"})


@app.delete("/api/posts/<int:post_id>/like")
@auth_required
def unlike_post(post_id):
    db = get_db()
    db.execute(
        "DELETE FROM likes WHERE post_id = ? AND user_id = ?", (post_id, g.user_id)
    )
    db.commit()
    return jsonify({"message": "Unliked"})


# ---------------------------------------------------------------------------
# Comments (nested under posts)
# ---------------------------------------------------------------------------
@app.get("/api/posts/<int:post_id>/comments")
def list_comments(post_id):
    db = get_db()
    rows = db.execute(
        """
        SELECT c.*, u.username, u.avatar_url
        FROM comments c JOIN users u ON u.id = c.user_id
        WHERE c.post_id = ?
        ORDER BY c.created_at ASC
        """,
        (post_id,),
    ).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.post("/api/posts/<int:post_id>/comments")
@auth_required
def add_comment(post_id):
    data = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Comment content is required"}), 400

    db = get_db()
    post = db.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
    if not post:
        return jsonify({"error": "Post not found"}), 404

    cur = db.execute(
        "INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)",
        (post_id, g.user_id, content),
    )
    db.commit()
    row = db.execute(
        """
        SELECT c.*, u.username, u.avatar_url FROM comments c
        JOIN users u ON u.id = c.user_id WHERE c.id = ?
        """,
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(row_to_dict(row)), 201


@app.delete("/api/posts/comments/<int:comment_id>")
@auth_required
def delete_comment(comment_id):
    db = get_db()
    comment = db.execute(
        "SELECT * FROM comments WHERE id = ?", (comment_id,)
    ).fetchone()
    if not comment:
        return jsonify({"error": "Comment not found"}), 404
    if comment["user_id"] != g.user_id:
        return jsonify({"error": "Not authorized"}), 403
    db.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
    db.commit()
    return jsonify({"message": "Comment deleted"})


# ===========================================================================
# Health check + frontend static serving
# ===========================================================================
@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path and os.path.exists(os.path.join(FRONTEND_DIR, path)):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, "index.html")


# ===========================================================================
# Entrypoint
# ===========================================================================
if __name__ == "__main__":
    init_db()
    print(f"Mini Social API (Flask) running on http://localhost:{PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=True)
