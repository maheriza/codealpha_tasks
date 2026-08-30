// ===================== Config & State =====================
const API_BASE = '/api'; // served from same origin as backend

let state = {
  token: localStorage.getItem('token') || null,
  currentUser: JSON.parse(localStorage.getItem('currentUser') || 'null'),
  viewedProfileId: null,
  feedMode: 'global', // 'global' | 'following'
  activePostId: null,
};

// ===================== API Helper =====================
async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && state.token) headers['Authorization'] = `Bearer ${state.token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

// ===================== Utilities =====================
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return document.querySelectorAll(sel); }

function showToast(msg) {
  const toast = $('#toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 2500);
}

function initials(name) {
  return (name || '?').slice(0, 2).toUpperCase();
}

function avatarEl(user, size = '') {
  const div = document.createElement('div');
  div.className = `avatar ${size}`;
  if (user && user.avatar_url) {
    div.style.backgroundImage = `url(${user.avatar_url})`;
    div.textContent = '';
  } else {
    div.textContent = initials(user && user.username);
  }
  return div;
}

function timeAgo(isoString) {
  const diff = (Date.now() - new Date(isoString + 'Z').getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ===================== View Switching =====================
function showView(name) {
  $all('.view').forEach(v => v.classList.add('hidden'));
  $(`#${name}View`).classList.remove('hidden');
  $all('.nav-link').forEach(b => b.classList.remove('active'));
  if (name === 'feed') $('#navFeedBtn').classList.add('active');
  if (name === 'profile') $('#navProfileBtn').classList.add('active');
}

function refreshNavForAuth() {
  const loggedIn = !!state.token;
  $('#navProfileBtn').classList.toggle('hidden', !loggedIn);
  $('#logoutBtn').classList.toggle('hidden', !loggedIn);
  $('#navFeedBtn').classList.toggle('hidden', !loggedIn);
  $('.nav-search').classList.toggle('hidden', !loggedIn);
}

// ===================== Auth =====================
$('#tabLogin').addEventListener('click', () => {
  $('#tabLogin').classList.add('active');
  $('#tabRegister').classList.remove('active');
  $('#loginForm').classList.remove('hidden');
  $('#registerForm').classList.add('hidden');
});
$('#tabRegister').addEventListener('click', () => {
  $('#tabRegister').classList.add('active');
  $('#tabLogin').classList.remove('active');
  $('#registerForm').classList.remove('hidden');
  $('#loginForm').classList.add('hidden');
});

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginError').textContent = '';
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      auth: false,
      body: {
        username: $('#loginUsername').value.trim(),
        password: $('#loginPassword').value,
      },
    });
    onAuthSuccess(data);
  } catch (err) {
    $('#loginError').textContent = err.message;
  }
});

$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#registerError').textContent = '';
  try {
    const data = await api('/auth/register', {
      method: 'POST',
      auth: false,
      body: {
        username: $('#regUsername').value.trim(),
        email: $('#regEmail').value.trim(),
        password: $('#regPassword').value,
        bio: $('#regBio').value.trim(),
      },
    });
    onAuthSuccess(data);
  } catch (err) {
    $('#registerError').textContent = err.message;
  }
});

function onAuthSuccess(data) {
  state.token = data.token;
  state.currentUser = data.user;
  localStorage.setItem('token', data.token);
  localStorage.setItem('currentUser', JSON.stringify(data.user));
  refreshNavForAuth();
  showView('feed');
  loadFeed();
}

$('#logoutBtn').addEventListener('click', () => {
  state.token = null;
  state.currentUser = null;
  localStorage.removeItem('token');
  localStorage.removeItem('currentUser');
  refreshNavForAuth();
  showView('auth');
});

// ===================== Navigation =====================
$('#navFeedBtn').addEventListener('click', () => { showView('feed'); loadFeed(); });
$('#navProfileBtn').addEventListener('click', () => openProfile(state.currentUser.id));
$('.brand').addEventListener('click', () => {
  if (state.token) { showView('feed'); loadFeed(); }
});

// ===================== Feed =====================
$('#tabGlobal').addEventListener('click', () => {
  state.feedMode = 'global';
  $('#tabGlobal').classList.add('active');
  $('#tabFollowing').classList.remove('active');
  loadFeed();
});
$('#tabFollowing').addEventListener('click', () => {
  state.feedMode = 'following';
  $('#tabFollowing').classList.add('active');
  $('#tabGlobal').classList.remove('active');
  loadFeed();
});

async function loadFeed() {
  const container = $('#postsContainer');
  container.innerHTML = '<p class="empty-state">Loading...</p>';
  try {
    const path = state.feedMode === 'following' ? '/posts/feed' : '/posts';
    const posts = await api(path);
    renderPosts(container, posts);
  } catch (err) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
  loadSuggestedUsers();

  const composerAvatar = $('#composerAvatar');
  composerAvatar.innerHTML = '';
  composerAvatar.appendChild(avatarEl(state.currentUser)).outerHTML;
  composerAvatar.replaceWith(Object.assign(avatarEl(state.currentUser), { id: 'composerAvatar' }));
}

function renderPosts(container, posts) {
  container.innerHTML = '';
  if (!posts.length) {
    container.innerHTML = '<p class="empty-state">No posts yet. Be the first to share something!</p>';
    return;
  }
  posts.forEach(post => container.appendChild(renderPostCard(post)));
}

function renderPostCard(post) {
  const card = document.createElement('div');
  card.className = 'card post-card';

  const avatar = avatarEl(post.author, 'avatar-sm');
  avatar.style.cursor = 'pointer';
  avatar.addEventListener('click', () => openProfile(post.author.id));

  const body = document.createElement('div');
  body.className = 'post-body';

  const isOwner = state.currentUser && state.currentUser.id === post.author.id;

  body.innerHTML = `
    <div class="post-header">
      <div>
        <span class="post-author">${escapeHtml(post.author.username)}</span>
        <div class="post-time">${timeAgo(post.created_at)}</div>
      </div>
      ${isOwner ? `<button class="btn-text" data-action="delete-post">Delete</button>` : ''}
    </div>
    <div class="post-content">${escapeHtml(post.content)}</div>
    ${post.image_url ? `<img class="post-image" src="${escapeHtml(post.image_url)}" onerror="this.style.display='none'" />` : ''}
    <div class="post-actions">
      <button class="post-action-btn ${post.likedByMe ? 'liked' : ''}" data-action="like">
        ${post.likedByMe ? '\u2764' : '\u2661'} <span>${post.likeCount}</span>
      </button>
      <button class="post-action-btn" data-action="comment">\uD83D\uDCAC <span>${post.commentCount}</span></button>
    </div>
  `;

  body.querySelector('.post-author').addEventListener('click', () => openProfile(post.author.id));

  body.querySelector('[data-action="like"]').addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      if (post.likedByMe) {
        await api(`/posts/${post.id}/like`, { method: 'DELETE' });
      } else {
        await api(`/posts/${post.id}/like`, { method: 'POST' });
      }
      post.likedByMe = !post.likedByMe;
      post.likeCount += post.likedByMe ? 1 : -1;
      const btn = body.querySelector('[data-action="like"]');
      btn.classList.toggle('liked', post.likedByMe);
      btn.innerHTML = `${post.likedByMe ? '\u2764' : '\u2661'} <span>${post.likeCount}</span>`;
    } catch (err) { showToast(err.message); }
  });

  body.querySelector('[data-action="comment"]').addEventListener('click', () => openPostModal(post.id));

  const deleteBtn = body.querySelector('[data-action="delete-post"]');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this post?')) return;
      try {
        await api(`/posts/${post.id}`, { method: 'DELETE' });
        card.remove();
        showToast('Post deleted');
      } catch (err) { showToast(err.message); }
    });
  }

  card.appendChild(avatar);
  card.appendChild(body);
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openPostModal(post.id);
  });
  return card;
}

$('#submitPostBtn').addEventListener('click', async () => {
  const content = $('#postContent').value.trim();
  const image_url = $('#postImageUrl').value.trim();
  if (!content) return showToast('Write something first');
  try {
    await api('/posts', { method: 'POST', body: { content, image_url } });
    $('#postContent').value = '';
    $('#postImageUrl').value = '';
    loadFeed();
  } catch (err) { showToast(err.message); }
});

async function loadSuggestedUsers() {
  const container = $('#suggestedUsers');
  try {
    const users = await api('/users');
    container.innerHTML = '';
    const filtered = users.filter(u => !state.currentUser || u.id !== state.currentUser.id).slice(0, 6);
    if (!filtered.length) {
      container.innerHTML = '<p class="empty-state">No users yet</p>';
      return;
    }
    filtered.forEach(u => {
      const row = document.createElement('div');
      row.className = 'suggested-user';
      const av = avatarEl(u, 'avatar-sm');
      const name = document.createElement('span');
      name.className = 'uname';
      name.textContent = u.username;
      row.appendChild(av);
      row.appendChild(name);
      row.addEventListener('click', () => openProfile(u.id));
      container.appendChild(row);
    });
  } catch (err) { /* ignore */ }
}

// ===================== Search =====================
let searchTimer = null;
$('#searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  const resultsBox = $('#searchResults');
  if (!q) { resultsBox.classList.add('hidden'); return; }
  searchTimer = setTimeout(async () => {
    try {
      const users = await api(`/users?q=${encodeURIComponent(q)}`);
      resultsBox.innerHTML = '';
      if (!users.length) {
        resultsBox.innerHTML = '<div class="search-result-item">No users found</div>';
      } else {
        users.forEach(u => {
          const item = document.createElement('div');
          item.className = 'search-result-item';
          const av = avatarEl(u, 'avatar-sm');
          const name = document.createElement('span');
          name.textContent = u.username;
          item.appendChild(av);
          item.appendChild(name);
          item.addEventListener('click', () => {
            resultsBox.classList.add('hidden');
            $('#searchInput').value = '';
            openProfile(u.id);
          });
          resultsBox.appendChild(item);
        });
      }
      resultsBox.classList.remove('hidden');
    } catch (err) { /* ignore */ }
  }, 300);
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-search')) $('#searchResults').classList.add('hidden');
});

// ===================== Profile =====================
async function openProfile(userId) {
  state.viewedProfileId = userId;
  showView('profile');
  try {
    const user = await api(`/users/${userId}`);
    $('#profileUsername').textContent = user.username;
    $('#profileBio').textContent = user.bio || 'No bio yet.';
    $('#statPosts').textContent = user.postCount;
    $('#statFollowers').querySelector('strong').textContent = user.followers;
    $('#statFollowing').querySelector('strong').textContent = user.following;

    const avatarContainer = $('#profileAvatar');
    avatarContainer.replaceWith(Object.assign(avatarEl(user, 'avatar-lg'), { id: 'profileAvatar' }));

    const isSelf = state.currentUser && state.currentUser.id === user.id;
    const followBtn = $('#followBtn');
    const editBtn = $('#editProfileBtn');

    followBtn.classList.toggle('hidden', isSelf);
    editBtn.classList.toggle('hidden', !isSelf);
    $('#editProfileForm').classList.add('hidden');

    if (!isSelf) {
      followBtn.textContent = user.isFollowing ? 'Following' : 'Follow';
      followBtn.className = user.isFollowing ? 'btn-secondary' : 'btn-primary';
      followBtn.onclick = async () => {
        try {
          if (user.isFollowing) {
            await api(`/users/${user.id}/follow`, { method: 'DELETE' });
          } else {
            await api(`/users/${user.id}/follow`, { method: 'POST' });
          }
          openProfile(user.id);
        } catch (err) { showToast(err.message); }
      };
    }

    editBtn.onclick = () => {
      $('#editBio').value = user.bio || '';
      $('#editAvatar').value = user.avatar_url || '';
      $('#editProfileForm').classList.remove('hidden');
    };

    $('#statFollowers').onclick = () => openFollowModal(user.id, 'followers');
    $('#statFollowing').onclick = () => openFollowModal(user.id, 'following');

    const postsContainer = $('#profilePosts');
    postsContainer.innerHTML = '<p class="empty-state">Loading...</p>';
    const posts = await api(`/posts/user/${userId}`);
    renderPosts(postsContainer, posts);
  } catch (err) {
    showToast(err.message);
  }
}

$('#saveProfileBtn').addEventListener('click', async () => {
  try {
    const updated = await api('/users/me/update', {
      method: 'PUT',
      body: { bio: $('#editBio').value.trim(), avatar_url: $('#editAvatar').value.trim() },
    });
    state.currentUser = { ...state.currentUser, ...updated };
    localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
    showToast('Profile updated');
    openProfile(state.currentUser.id);
  } catch (err) { showToast(err.message); }
});

// ===================== Follow Modal =====================
async function openFollowModal(userId, type) {
  $('#followModalTitle').textContent = type === 'followers' ? 'Followers' : 'Following';
  const list = $('#followModalList');
  list.innerHTML = '<p class="empty-state">Loading...</p>';
  $('#followModal').classList.remove('hidden');
  try {
    const users = await api(`/users/${userId}/${type}`);
    list.innerHTML = '';
    if (!users.length) {
      list.innerHTML = `<p class="empty-state">No ${type} yet</p>`;
      return;
    }
    users.forEach(u => {
      const row = document.createElement('div');
      row.className = 'follow-list-item';
      const av = avatarEl(u, 'avatar-sm');
      const name = document.createElement('span');
      name.textContent = u.username;
      row.appendChild(av);
      row.appendChild(name);
      row.addEventListener('click', () => {
        $('#followModal').classList.add('hidden');
        openProfile(u.id);
      });
      list.appendChild(row);
    });
  } catch (err) {
    list.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}
$('#closeFollowModal').addEventListener('click', () => $('#followModal').classList.add('hidden'));

// ===================== Post Detail / Comments Modal =====================
async function openPostModal(postId) {
  state.activePostId = postId;
  $('#postModal').classList.remove('hidden');
  $('#postModalBody').innerHTML = '<p class="empty-state">Loading...</p>';
  $('#commentsList').innerHTML = '';
  try {
    const post = await api(`/posts/${postId}`);
    const body = $('#postModalBody');
    body.innerHTML = '';
    body.appendChild(renderPostCard(post));
    await loadComments(postId);
  } catch (err) { showToast(err.message); }
}
$('#closePostModal').addEventListener('click', () => {
  $('#postModal').classList.add('hidden');
  loadFeedOrProfileRefresh();
});

function loadFeedOrProfileRefresh() {
  if (!$('#feedView').classList.contains('hidden')) loadFeed();
  if (!$('#profileView').classList.contains('hidden')) openProfile(state.viewedProfileId);
}

async function loadComments(postId) {
  const list = $('#commentsList');
  list.innerHTML = '<p class="empty-state">Loading comments...</p>';
  try {
    const comments = await api(`/posts/${postId}/comments`);
    list.innerHTML = '';
    if (!comments.length) {
      list.innerHTML = '<p class="empty-state">No comments yet. Say something!</p>';
      return;
    }
    comments.forEach(c => list.appendChild(renderComment(c)));
  } catch (err) {
    list.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

function renderComment(comment) {
  const row = document.createElement('div');
  row.className = 'comment-item';
  const av = avatarEl({ username: comment.username, avatar_url: comment.avatar_url }, 'avatar-sm');
  const body = document.createElement('div');
  body.className = 'comment-body';
  const isOwner = state.currentUser && state.currentUser.id === comment.user_id;
  body.innerHTML = `
    <div class="comment-author">${escapeHtml(comment.username)} ${isOwner ? '<button class="btn-text" data-action="delete-comment">Delete</button>' : ''}</div>
    <div class="comment-text">${escapeHtml(comment.content)}</div>
  `;
  const delBtn = body.querySelector('[data-action="delete-comment"]');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      try {
        await api(`/posts/comments/${comment.id}`, { method: 'DELETE' });
        row.remove();
      } catch (err) { showToast(err.message); }
    });
  }
  row.appendChild(av);
  row.appendChild(body);
  return row;
}

$('#submitCommentBtn').addEventListener('click', submitComment);
$('#commentInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitComment();
});

async function submitComment() {
  const input = $('#commentInput');
  const content = input.value.trim();
  if (!content || !state.activePostId) return;
  try {
    await api(`/posts/${state.activePostId}/comments`, { method: 'POST', body: { content } });
    input.value = '';
    await loadComments(state.activePostId);
    const post = await api(`/posts/${state.activePostId}`);
    const body = $('#postModalBody');
    body.innerHTML = '';
    body.appendChild(renderPostCard(post));
  } catch (err) { showToast(err.message); }
}

// ===================== Init =====================
function init() {
  refreshNavForAuth();
  if (state.token && state.currentUser) {
    showView('feed');
    loadFeed();
  } else {
    showView('auth');
  }
}

init();
