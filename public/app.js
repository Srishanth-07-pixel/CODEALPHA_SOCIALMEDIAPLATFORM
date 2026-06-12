// ── State ────────────────────────────────────────────────────────────────────
const API   = '/api';
let token   = localStorage.getItem('echo_token');
let currentUser = JSON.parse(localStorage.getItem('echo_user') || 'null');
let currentFeed = 'following';
let activePostId = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
async function api(method, path, body, isFormData = false) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}` }
  };
  if (body && !isFormData) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (isFormData) {
    opts.body = body;
  }
  const res = await fetch(API + path, opts);
  return res.json();
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function avatarEl(username, avatar, size = 'sm') {
  const div = document.createElement('div');
  div.className = `avatar-${size}`;
  if (avatar) {
    div.innerHTML = `<img src="${avatar}" alt="${username}" />`;
  } else {
    div.textContent = username[0].toUpperCase();
  }
  return div;
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError(id) {
  document.getElementById(id).classList.add('hidden');
}

// ── Auth ─────────────────────────────────────────────────────────────────────
function switchAuth(mode) {
  document.getElementById('login-form').classList.toggle('active', mode === 'login');
  document.getElementById('register-form').classList.toggle('active', mode === 'register');
}

async function handleLogin() {
  hideError('login-error');
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return showError('login-error', 'Fill all fields');

  const data = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  }).then(r => r.json());

  if (data.error) return showError('login-error', data.error);
  loginSuccess(data);
}

async function handleRegister() {
  hideError('register-error');
  const username = document.getElementById('reg-username').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!username || !email || !password) return showError('register-error', 'Fill all fields');
  if (password.length < 6) return showError('register-error', 'Password min 6 chars');

  const data = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  }).then(r => r.json());

  if (data.error) return showError('register-error', data.error);
  loginSuccess(data);
}

function loginSuccess(data) {
  token       = data.token;
  currentUser = data.user;
  localStorage.setItem('echo_token', token);
  localStorage.setItem('echo_user', JSON.stringify(currentUser));
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  initApp();
}

function handleLogout() {
  localStorage.removeItem('echo_token');
  localStorage.removeItem('echo_user');
  token = null; currentUser = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
}

// ── Navigation ───────────────────────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

  if (page === 'feed')    loadFeed();
  if (page === 'explore') loadExplore();
  if (page === 'profile') loadProfile(currentUser.username);
}

// ── Init ─────────────────────────────────────────────────────────────────────
function initApp() {
  // Feed avatar
  const fa = document.getElementById('feed-avatar');
  if (currentUser.avatar) {
    fa.innerHTML = `<img src="${currentUser.avatar}" alt="" />`;
  } else {
    fa.textContent = currentUser.username[0].toUpperCase();
  }

  loadFeed();
  loadSuggested();
}

// ── Feed ─────────────────────────────────────────────────────────────────────
function switchFeed(type) {
  currentFeed = type;
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', (i === 0 && type === 'following') || (i === 1 && type === 'all'));
  });
  loadFeed();
}

async function loadFeed() {
  const container = document.getElementById('feed-posts');
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  const endpoint = currentFeed === 'following' ? '/posts/following' : '/posts/feed';
  const posts = await api('GET', endpoint);
  renderPosts(container, posts);
}

function renderPosts(container, posts) {
  if (!Array.isArray(posts) || posts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="emoji">🌌</div>
        <p>No posts yet. Start following people or create your first post!</p>
      </div>`;
    return;
  }
  container.innerHTML = '';
  posts.forEach(p => container.appendChild(buildPostCard(p)));
}

function buildPostCard(post) {
  const card = document.createElement('div');
  card.className = 'post-card';
  card.addEventListener('click', () => openPostModal(post.id));

  const av = avatarEl(post.username, post.avatar, 'sm');
  av.style.cursor = 'pointer';
  av.addEventListener('click', e => { e.stopPropagation(); loadProfilePage(post.username); });

  card.innerHTML = `
    <div class="post-header">
      <div class="post-user">
        <div class="post-av-slot"></div>
        <div class="post-meta">
          <span class="post-username">${post.username}</span>
          <span class="post-time">${timeAgo(post.created_at)}</span>
        </div>
      </div>
    </div>
    <p class="post-content">${escapeHtml(post.content)}</p>
    ${post.image ? `<img class="post-image" src="${post.image}" alt="" loading="lazy" />` : ''}
    <div class="post-actions">
      <button class="action-btn like-btn ${post.liked_by_me ? 'liked' : ''}" data-post="${post.id}" data-liked="${post.liked_by_me}" onclick="event.stopPropagation(); toggleLike(this, ${post.id})">
        <svg viewBox="0 0 24 24" stroke="currentColor" fill="${post.liked_by_me ? 'currentColor' : 'none'}" stroke-width="2">
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
        </svg>
        <span class="like-count">${post.likes_count}</span>
      </button>
      <button class="action-btn" onclick="event.stopPropagation(); openPostModal(${post.id})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        <span>${post.comments_count}</span>
      </button>
      ${post.user_id === currentUser.id ? `
        <button class="action-btn delete-post-btn" onclick="event.stopPropagation(); deletePost(${post.id}, this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>` : ''}
    </div>`;

  card.querySelector('.post-av-slot').replaceWith(av);
  return card;
}

function escapeHtml(text) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Likes ─────────────────────────────────────────────────────────────────────
async function toggleLike(btn, postId) {
  const data = await api('POST', `/posts/${postId}/like`);
  btn.classList.toggle('liked', data.liked);
  btn.querySelector('svg').setAttribute('fill', data.liked ? 'currentColor' : 'none');
  btn.querySelector('.like-count').textContent = data.likes_count;
  btn.dataset.liked = data.liked;
}

// ── Delete Post ───────────────────────────────────────────────────────────────
async function deletePost(postId, btn) {
  if (!confirm('Delete this post?')) return;
  await api('DELETE', `/posts/${postId}`);
  btn.closest('.post-card').remove();
}

// ── Create Post ───────────────────────────────────────────────────────────────
let selectedImageFile = null;

function previewImage(input) {
  if (input.files && input.files[0]) {
    selectedImageFile = input.files[0];
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('preview-img').src = e.target.result;
      document.getElementById('image-preview').classList.remove('hidden');
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function removeImage() {
  selectedImageFile = null;
  document.getElementById('post-image').value = '';
  document.getElementById('image-preview').classList.add('hidden');
}

async function createPost() {
  const content = document.getElementById('post-content').value.trim();
  if (!content) return;

  const fd = new FormData();
  fd.append('content', content);
  if (selectedImageFile) fd.append('image', selectedImageFile);

  const post = await api('POST', '/posts', fd, true);
  if (post.error) return alert(post.error);

  document.getElementById('post-content').value = '';
  removeImage();

  const container = document.getElementById('feed-posts');
  const emptyState = container.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  container.insertBefore(buildPostCard(post), container.firstChild);
}

// ── Post Modal ────────────────────────────────────────────────────────────────
async function openPostModal(postId) {
  activePostId = postId;
  const [post, comments] = await Promise.all([
    api('GET', `/posts/${postId}`),
    api('GET', `/posts/${postId}/comments`)
  ]);

  const modalPost = document.getElementById('modal-post-content');
  const av = avatarEl(post.username, post.avatar, 'sm');

  modalPost.innerHTML = '';
  const postDiv = buildPostCard(post);
  postDiv.style.cursor = 'default';
  postDiv.style.marginBottom = '0';
  modalPost.appendChild(postDiv);

  renderComments(comments);
  document.getElementById('post-modal').classList.remove('hidden');
  document.getElementById('comment-input').focus();
}

function renderComments(comments) {
  const list = document.getElementById('modal-comments');
  list.innerHTML = '';
  if (comments.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:10px">No comments yet</p>';
    return;
  }
  comments.forEach(c => {
    const item = document.createElement('div');
    item.className = 'comment-item';
    const av = avatarEl(c.username, c.avatar, 'sm');
    av.style.width = '28px';
    av.style.height = '28px';
    av.style.fontSize = '11px';
    item.appendChild(av);
    item.innerHTML += `
      <div class="comment-body">
        <div class="comment-user">${c.username}</div>
        <div class="comment-text">${escapeHtml(c.content)}</div>
        <div class="comment-time">${timeAgo(c.created_at)}</div>
      </div>`;
    list.appendChild(item);
  });
  list.scrollTop = list.scrollHeight;
}

async function submitComment() {
  const input = document.getElementById('comment-input');
  const content = input.value.trim();
  if (!content || !activePostId) return;

  const comment = await api('POST', `/posts/${activePostId}/comments`, { content });
  if (comment.error) return;

  input.value = '';
  const list = document.getElementById('modal-comments');
  const noComment = list.querySelector('p');
  if (noComment) noComment.remove();

  const item = document.createElement('div');
  item.className = 'comment-item';
  const av = avatarEl(comment.username, comment.avatar, 'sm');
  av.style.width = '28px'; av.style.height = '28px'; av.style.fontSize = '11px';
  item.appendChild(av);
  item.innerHTML += `
    <div class="comment-body">
      <div class="comment-user">${comment.username}</div>
      <div class="comment-text">${escapeHtml(comment.content)}</div>
      <div class="comment-time">just now</div>
    </div>`;
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;

  // Update comment count in feed
  document.querySelectorAll(`.action-btn[data-post="${activePostId}"]`).forEach(btn => {
    const svg = btn.querySelector('path[d^="M21 15"]');
    if (svg) btn.querySelector('span').textContent = parseInt(btn.querySelector('span').textContent) + 1;
  });
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement.id === 'comment-input') submitComment();
});

function closeModal(e) {
  if (e.target.id === 'post-modal') closePostModal();
}

function closePostModal() {
  document.getElementById('post-modal').classList.add('hidden');
  activePostId = null;
}

// ── Explore ───────────────────────────────────────────────────────────────────
async function loadExplore() {
  document.getElementById('search-results').innerHTML = '';
  const container = document.getElementById('explore-posts');
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  const posts = await api('GET', '/posts/feed');
  renderPosts(container, posts);
}

let searchTimeout;
async function searchUsers() {
  clearTimeout(searchTimeout);
  const q = document.getElementById('search-input').value.trim();
  searchTimeout = setTimeout(async () => {
    if (!q) { document.getElementById('search-results').innerHTML = ''; return; }
    const users = await api('GET', `/users?q=${encodeURIComponent(q)}`);
    const container = document.getElementById('search-results');
    container.innerHTML = '';
    if (!users.length) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No users found</p>';
      return;
    }
    users.forEach(u => container.appendChild(buildUserItem(u)));
  }, 300);
}

function buildUserItem(user) {
  const item = document.createElement('div');
  item.className = 'user-item';
  const isMe = user.id === currentUser.id;

  const av = avatarEl(user.username, user.avatar, 'sm');
  item.appendChild(av);

  item.innerHTML += `
    <div class="user-item-info">
      <div class="user-item-name">${user.username}</div>
      <div class="user-item-bio">${user.bio || 'No bio yet'}</div>
    </div>
    ${!isMe ? `<button class="follow-btn" onclick="event.stopPropagation(); quickFollow(this, ${user.id})">Follow</button>` : ''}`;

  item.addEventListener('click', () => loadProfilePage(user.username));
  return item;
}

async function quickFollow(btn, userId) {
  const data = await api('POST', `/follow/${userId}`);
  if (data.following) {
    btn.textContent = 'Following';
    btn.classList.add('following');
  } else {
    btn.textContent = 'Follow';
    btn.classList.remove('following');
  }
}

// ── Profile ───────────────────────────────────────────────────────────────────
function loadProfilePage(username) {
  navigate('profile');
  loadProfile(username);
}

async function loadProfile(username) {
  const container = document.getElementById('profile-content');
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  const [profile, posts] = await Promise.all([
    api('GET', `/users/${username}`),
    api('GET', `/users/${username}/posts`)
  ]);

  if (profile.error) {
    container.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-muted)">User not found</p>';
    return;
  }

  const isMe = profile.id === currentUser.id;

  container.innerHTML = `
    <div class="profile-header">
      <div class="profile-top">
        <div id="p-avatar-slot"></div>
        <div class="profile-info">
          <div class="profile-name">@${profile.username}</div>
          <div class="profile-bio" id="p-bio">${profile.bio || 'No bio yet'}</div>
          <div class="profile-stats">
            <div class="stat-item"><span class="stat-num">${profile.posts_count}</span><span class="stat-label">Posts</span></div>
            <div class="stat-item"><span class="stat-num">${profile.followers_count}</span><span class="stat-label">Followers</span></div>
            <div class="stat-item"><span class="stat-num">${profile.following_count}</span><span class="stat-label">Following</span></div>
          </div>
          <div class="profile-actions">
            ${isMe
              ? `<button class="btn-outline" onclick="toggleBioEdit()">Edit Bio</button>`
              : `<button class="btn-outline follow-main-btn ${profile.isFollowing ? 'following' : ''}" 
                   onclick="toggleFollowProfile(this, ${profile.id})">
                   ${profile.isFollowing ? 'Following' : 'Follow'}
                 </button>`
            }
          </div>
          ${isMe ? `
            <div class="bio-edit-row hidden" id="bio-edit-row">
              <textarea id="bio-input" placeholder="Write your bio…">${profile.bio || ''}</textarea>
              <button class="btn-sm" onclick="saveBio()">Save</button>
            </div>` : ''}
        </div>
      </div>
    </div>
    <div id="profile-posts" class="posts-list"></div>`;

  const avLg = avatarEl(profile.username, profile.avatar, 'lg');
  container.querySelector('#p-avatar-slot').replaceWith(avLg);

  const postsEl = document.getElementById('profile-posts');
  renderPosts(postsEl, posts);
}

function toggleBioEdit() {
  document.getElementById('bio-edit-row').classList.toggle('hidden');
}

async function saveBio() {
  const bio = document.getElementById('bio-input').value.trim();
  const fd = new FormData();
  fd.append('bio', bio);
  const updated = await api('PUT', '/users/profile/update', fd, true);
  if (updated.error) return alert(updated.error);
  currentUser.bio = updated.bio;
  localStorage.setItem('echo_user', JSON.stringify(currentUser));
  document.getElementById('p-bio').textContent = bio || 'No bio yet';
  document.getElementById('bio-edit-row').classList.add('hidden');
}

async function toggleFollowProfile(btn, userId) {
  const data = await api('POST', `/follow/${userId}`);
  if (data.following) {
    btn.textContent = 'Following';
    btn.classList.add('following');
  } else {
    btn.textContent = 'Follow';
    btn.classList.remove('following');
  }
}

// ── Suggested Users ───────────────────────────────────────────────────────────
async function loadSuggested() {
  const users = await api('GET', '/users?q=');
  const container = document.getElementById('suggested-users');
  container.innerHTML = '';
  const filtered = users.filter(u => u.id !== currentUser.id).slice(0, 6);
  if (!filtered.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:12px;padding:8px">No suggestions yet</p>';
    return;
  }
  filtered.forEach(u => {
    const item = document.createElement('div');
    item.className = 'suggested-item';
    const av = avatarEl(u.username, u.avatar, 'sm');
    av.style.width = '32px'; av.style.height = '32px'; av.style.fontSize = '12px';
    item.appendChild(av);
    item.innerHTML += `
      <div class="suggested-info">
        <div class="suggested-name">${u.username}</div>
        <div class="suggested-bio">${u.bio || 'Echo user'}</div>
      </div>
      <button class="follow-btn-sm" onclick="event.stopPropagation(); quickFollowSuggested(this, ${u.id})">Follow</button>`;
    item.addEventListener('click', () => loadProfilePage(u.username));
    container.appendChild(item);
  });
}

async function quickFollowSuggested(btn, userId) {
  const data = await api('POST', `/follow/${userId}`);
  btn.textContent = data.following ? '✓' : 'Follow';
  btn.style.opacity = data.following ? '0.5' : '1';
}

// ── Boot ──────────────────────────────────────────────────────────────────────
if (token && currentUser) {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  initApp();
}

// Enter key for auth forms
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const lf = document.getElementById('login-form');
  const rf = document.getElementById('register-form');
  if (lf.classList.contains('active'))  handleLogin();
  if (rf.classList.contains('active'))  handleRegister();
});
