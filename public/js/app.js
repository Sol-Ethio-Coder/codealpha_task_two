// ============================================================
// PULSE — frontend app logic (vanilla JS, no build step)
// ============================================================

const API = '/api';
const state = {
  token: localStorage.getItem('pulse_token') || null,
  me: null,
  view: 'feed-following', // feed-following | feed-all | feed-trending | notifications | profile-self | profile-other
};

// ---------- toast (visible errors/success — no more silent alert()s) ----------
const toastStack = document.getElementById('toast-stack');
function toast(message, type = 'error') {
  const el = document.createElement('div');
  el.className = `toast${type === 'success' ? ' success' : ''}`;
  el.textContent = message;
  toastStack.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// ---------- helpers ----------
function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    // fetch itself threw — the server is unreachable (not running, wrong port, no network)
    console.error('Network error calling', path, networkErr);
    throw new Error("Can't reach the server. Is it running?");
  }

  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    // Server sent back something that wasn't JSON (an HTML error page, for example).
    console.error(`Expected JSON from ${path} but got:`, raw.slice(0, 300));
    throw new Error(`Server returned an unexpected response (status ${res.status}).`);
  }

  if (!res.ok) {
    console.error(`API error on ${method} ${path}:`, data);
    throw new Error(data.message || `Request failed (status ${res.status}).`);
  }
  return data;
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  return new Date(dateStr).toLocaleDateString();
}

function initials(name) {
  return (name || '?').trim().slice(0, 2).toUpperCase();
}

function paintAvatar(el, user) {
  el.title = user.displayName || user.username;
  if (user.avatarUrl) {
    el.style.backgroundImage = `url(${user.avatarUrl})`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.textContent = '';
  } else {
    el.style.backgroundImage = 'none';
    el.style.background = `linear-gradient(135deg, ${user.avatarColor || '#6C5CE7'}, #ffb27a)`;
    el.textContent = initials(user.displayName || user.username);
  }
}

function isFollowing(userId) {
  return state.me && state.me.following.some((id) => String(id) === String(userId));
}

function isLikedByMe(post) {
  return post.likes.some((l) => String(l.user._id || l.user) === String(state.me._id));
}

function isBookmarked(postId) {
  return state.me && state.me.bookmarks.some((id) => String(id) === String(postId));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- auth screen ----------
const authScreen = document.getElementById('auth-screen');
const appShell = document.getElementById('app-shell');

document.querySelectorAll('.auth-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    document.getElementById('login-form').classList.toggle('hidden', target !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', target !== 'register');
  });
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  const fd = new FormData(e.target);
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: { emailOrUsername: fd.get('emailOrUsername'), password: fd.get('password') },
    });
    onAuthSuccess(data);
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('register-error');
  errEl.textContent = '';
  const fd = new FormData(e.target);
  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: {
        username: fd.get('username'),
        email: fd.get('email'),
        password: fd.get('password'),
      },
    });
    onAuthSuccess(data);
  } catch (err) {
    errEl.textContent = err.message;
  }
});

function onAuthSuccess(data) {
  state.token = data.token;
  state.me = data.user;
  localStorage.setItem('pulse_token', data.token);
  showApp();
}

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('pulse_token');
  state.token = null;
  state.me = null;
  appShell.classList.add('hidden');
  authScreen.classList.remove('hidden');
});

// ---------- boot ----------
async function boot() {
  if (!state.token) return; // stay on auth screen
  try {
    const data = await api('/auth/me');
    state.me = data.user;
    showApp();
  } catch {
    localStorage.removeItem('pulse_token');
    state.token = null;
  }
}

function showApp() {
  authScreen.classList.add('hidden');
  appShell.classList.remove('hidden');
  paintAvatar(document.getElementById('composer-avatar'), state.me);
  loadFeed();
  loadSuggested();
  refreshNotifBadge();
}

// ---------- nav ----------
document.querySelectorAll('.rail-link').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.rail-link').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    state.view = view;
    document.getElementById('composer').classList.toggle('hidden', view !== 'feed-following' && view !== 'feed-all' && view !== 'feed-trending');

    if (view === 'feed-following') {
      setFeedTitle('Following');
      loadFeed();
    } else if (view === 'feed-all') {
      setFeedTitle('Discover');
      loadFeed('all');
    } else if (view === 'feed-trending') {
      setFeedTitle('Trending');
      loadFeed('trending');
    } else if (view === 'notifications') {
      setFeedTitle('Notifications');
      loadNotifications();
    } else if (view === 'people') {
      setFeedTitle('People');
      loadPeoplePage();
    } else if (view === 'saved') {
      setFeedTitle('Saved');
      loadSaved();
    } else if (view === 'profile-self') {
      loadProfile(state.me.username);
    }
  });
});

function setFeedTitle(title) {
  document.getElementById('feed-title').textContent = title;
}

// ---------- composer ----------
const composerText = document.getElementById('composer-text');
const charCount = document.getElementById('char-count');
composerText.addEventListener('input', () => {
  charCount.textContent = 500 - composerText.value.length;
});

document.getElementById('composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = composerText.value.trim();
  if (!text) return;

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await api('/posts', { method: 'POST', body: { text } });
    composerText.value = '';
    charCount.textContent = '500';
    toast('Posted!', 'success');
    if (state.view === 'feed-following') loadFeed();
    else if (state.view === 'feed-all') loadFeed('all');
    else if (state.view === 'feed-trending') loadFeed('trending');
  } catch (err) {
    toast(err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- feed rendering ----------
const feedList = document.getElementById('feed-list');
const tplPost = document.getElementById('tpl-post');

async function loadFeed(scope) {
  feedList.innerHTML = '<p class="empty-state">Loading your feed…</p>';
  try {
    const qs = scope ? `?scope=${scope}` : '';
    const posts = await api(`/posts${qs}`);
    renderFeed(posts);
  } catch (err) {
    feedList.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
    toast(err.message);
  }
}

function renderFeed(posts) {
  feedList.innerHTML = '';
  if (!posts.length) {
    feedList.innerHTML = `<p class="empty-state">Nothing here yet. Follow people from "Discover" or write the first post.</p>`;
    return;
  }
  posts.forEach((post) => feedList.appendChild(renderPostCard(post)));
}

function renderPostCard(post) {
  const node = tplPost.content.cloneNode(true);
  const card = node.querySelector('.post-card');
  card.dataset.id = post._id;

  paintAvatar(node.querySelector('.avatar'), post.author);
  node.querySelector('.post-author').textContent = post.author.displayName || post.author.username;
  node.querySelector('.post-time').textContent = timeAgo(post.createdAt) + (post.edited ? ' · edited' : '');
  const textEl = node.querySelector('.post-text');
  textEl.textContent = post.text;

  const isMine = String(post.author._id) === String(state.me._id);

  // ---- edit ----
  const editBtn = node.querySelector('.post-edit');
  const editForm = node.querySelector('.post-edit-form');
  const editTextarea = editForm.querySelector('textarea');
  if (isMine) {
    editBtn.addEventListener('click', () => {
      editTextarea.value = post.text;
      textEl.classList.add('hidden');
      editForm.classList.remove('hidden');
      editTextarea.focus();
    });
    editForm.querySelector('.edit-cancel').addEventListener('click', () => {
      editForm.classList.add('hidden');
      textEl.classList.remove('hidden');
    });
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newText = editTextarea.value.trim();
      if (!newText) return;
      try {
        const updated = await api(`/posts/${post._id}`, { method: 'PUT', body: { text: newText } });
        post.text = updated.text;
        post.edited = updated.edited;
        textEl.textContent = updated.text;
        card.querySelector('.post-time').textContent = timeAgo(updated.createdAt) + (updated.edited ? ' · edited' : '');
        editForm.classList.add('hidden');
        textEl.classList.remove('hidden');
        toast('Post updated', 'success');
      } catch (err) {
        toast(err.message);
      }
    });
  } else {
    editBtn.remove();
  }

  // ---- delete ----
  const deleteBtn = node.querySelector('.post-delete');
  if (isMine) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete this post?')) return;
      try {
        await api(`/posts/${post._id}`, { method: 'DELETE' });
        card.remove();
        toast('Post deleted', 'success');
      } catch (err) {
        toast(err.message);
      }
    });
  } else {
    deleteBtn.remove();
  }

  // ---- like ----
  const likeBtn = node.querySelector('.action-like');
  const likeCount = node.querySelector('.like-count');
  likeBtn.classList.toggle('liked', isLikedByMe(post));
  likeCount.textContent = post.likes.length;
  likeBtn.addEventListener('click', async () => {
    try {
      const updated = await api(`/posts/${post._id}/like`, { method: 'POST' });
      likeBtn.classList.toggle('liked', isLikedByMe(updated));
      likeCount.textContent = updated.likes.length;
    } catch (err) {
      toast(err.message);
    }
  });

  // ---- bookmark ----
  const bookmarkBtn = node.querySelector('.action-bookmark');
  bookmarkBtn.classList.toggle('saved', isBookmarked(post._id));
  bookmarkBtn.addEventListener('click', async () => {
    try {
      const res = await api(`/posts/${post._id}/bookmark`, { method: 'POST' });
      state.me.bookmarks = res.bookmarks;
      bookmarkBtn.classList.toggle('saved', res.bookmarked);
      toast(res.bookmarked ? 'Saved' : 'Removed from saved', 'success');
      if (state.view === 'saved' && !res.bookmarked) {
        card.remove();
      }
    } catch (err) {
      toast(err.message);
    }
  });

  // ---- comments ----
  const commentBtn = node.querySelector('.action-comment');
  const commentCount = node.querySelector('.comment-count');
  const commentsBlock = node.querySelector('.comments-block');
  const commentsList = node.querySelector('.comments-list');
  commentCount.textContent = post.comments.length;
  renderComments(commentsList, post);

  commentBtn.addEventListener('click', () => {
    commentsBlock.classList.toggle('hidden');
  });

  const commentForm = node.querySelector('.comment-form');
  commentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = commentForm.querySelector('input');
    const text = input.value.trim();
    if (!text) return;
    try {
      const updated = await api(`/posts/${post._id}/comments`, { method: 'POST', body: { text } });
      input.value = '';
      commentCount.textContent = updated.comments.length;
      renderComments(commentsList, updated);
    } catch (err) {
      toast(err.message);
    }
  });

  return node;
}

function renderComments(container, post) {
  container.innerHTML = '';
  post.comments.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'comment-row';

    const av = document.createElement('div');
    av.className = 'avatar';
    paintAvatar(av, c.author);

    const bubble = document.createElement('div');
    bubble.className = 'comment-bubble';
    const canDelete =
      String(c.author._id) === String(state.me._id) || String(post.author._id) === String(state.me._id);
    bubble.innerHTML = `<b>${escapeHtml(c.author.displayName || c.author.username)}</b><br>${escapeHtml(c.text)}`;

    row.appendChild(av);
    row.appendChild(bubble);

    if (canDelete) {
      const del = document.createElement('button');
      del.className = 'comment-del';
      del.textContent = '✕';
      del.addEventListener('click', async () => {
        try {
          const updated = await api(`/posts/${post._id}/comments/${c._id}`, { method: 'DELETE' });
          renderComments(container, updated);
          const card = container.closest('.post-card');
          card.querySelector('.comment-count').textContent = updated.comments.length;
        } catch (err) {
          toast(err.message);
        }
      });
      row.appendChild(del);
    }

    container.appendChild(row);
  });
}

// ---------- discover / search / suggested ----------
const searchInput = document.getElementById('user-search');
const searchResults = document.getElementById('user-search-results');
const tplPerson = document.getElementById('tpl-person-row');
let searchTimer;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (!q) {
    searchResults.innerHTML = '';
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const users = await api(`/users?q=${encodeURIComponent(q)}`);
      renderPeopleList(searchResults, users);
    } catch (err) {
      toast(err.message);
    }
  }, 300);
});

async function loadSuggested() {
  try {
    const users = await api('/users');
    const notFollowed = users.filter((u) => !isFollowing(u._id)).slice(0, 6);
    renderPeopleList(document.getElementById('suggested-list'), notFollowed);
  } catch (err) {
    toast(err.message);
  }
}

function renderPeopleList(container, users) {
  container.innerHTML = '';
  if (!users.length) {
    container.innerHTML = '<p class="empty-state" style="padding:8px 0;">No one to show.</p>';
    return;
  }
  users.forEach((u) => {
    const node = tplPerson.content.cloneNode(true);
    paintAvatar(node.querySelector('.avatar'), u);
    node.querySelector('.person-name').textContent = u.displayName || u.username;
    node.querySelector('.person-handle').textContent = `@${u.username}`;
    const followBtn = node.querySelector('.follow-btn');
    const following = isFollowing(u._id);
    followBtn.textContent = following ? 'Following' : 'Follow';
    followBtn.classList.toggle('following', following);

    followBtn.addEventListener('click', async () => {
      try {
        const res = await api(`/users/${u._id}/follow`, { method: 'POST' });
        state.me.following = res.following
          ? [...state.me.following, u._id]
          : state.me.following.filter((id) => String(id) !== String(u._id));
        followBtn.textContent = res.following ? 'Following' : 'Follow';
        followBtn.classList.toggle('following', res.following);
      } catch (err) {
        toast(err.message);
      }
    });

    const row = node.querySelector('.person-row');
    row.querySelector('.person-name').style.cursor = 'pointer';
    row.addEventListener('click', (e) => {
      if (e.target === followBtn) return;
      openProfile(u.username);
    });

    container.appendChild(node);
  });
}

function openProfile(username) {
  document.querySelectorAll('.rail-link').forEach((b) => b.classList.remove('active'));
  document.getElementById('composer').classList.add('hidden');
  loadProfile(username);
}

// ---------- notifications ----------
async function refreshNotifBadge() {
  try {
    const items = await api('/posts/notifications/mine');
    const badge = document.getElementById('notif-badge');
    if (items.length) {
      badge.textContent = items.length > 9 ? '9+' : String(items.length);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch {
    // silent — badge just won't update this cycle
  }
}

async function loadNotifications() {
  feedList.innerHTML = '<p class="empty-state">Loading notifications…</p>';
  try {
    const items = await api('/posts/notifications/mine');
    document.getElementById('notif-badge').classList.add('hidden');
    if (!items.length) {
      feedList.innerHTML = '<p class="empty-state">No notifications yet — likes and comments on your posts show up here.</p>';
      return;
    }
    feedList.innerHTML = '';
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'notif-row';

      const av = document.createElement('div');
      av.className = 'avatar';
      paintAvatar(av, item.actor);

      const body = document.createElement('div');
      body.className = 'notif-text';
      const name = `<b>${escapeHtml(item.actor.displayName || item.actor.username)}</b>`;
      if (item.type === 'like') {
        body.innerHTML = `${name} liked your post<span class="notif-snippet">"${escapeHtml(item.postText.slice(0, 80))}"</span>`;
      } else {
        body.innerHTML = `${name} commented: "${escapeHtml(item.commentText)}"<span class="notif-snippet">on "${escapeHtml(item.postText.slice(0, 60))}"</span>`;
      }

      const time = document.createElement('span');
      time.className = 'notif-time';
      time.textContent = timeAgo(item.createdAt);

      row.appendChild(av);
      row.appendChild(body);
      row.appendChild(time);
      feedList.appendChild(row);
    });
  } catch (err) {
    feedList.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
    toast(err.message);
  }
}

// ---------- profile view ----------
async function loadProfile(username) {
  feedList.innerHTML = '<p class="empty-state">Loading profile…</p>';
  document.getElementById('composer').classList.add('hidden');
  setFeedTitle('Profile');

  try {
    const { user, posts } = await api(`/users/${username}`);
    const isSelf = String(user._id) === String(state.me._id);

    const wrap = document.createElement('div');

    const head = document.createElement('div');
    head.className = 'profile-head';
    head.innerHTML = `
      <div class="profile-top">
        <div class="avatar-upload-wrap">
          <div class="avatar profile-avatar"></div>
          ${isSelf ? `
            <button type="button" class="avatar-edit-btn" title="Change photo">
              <svg viewBox="0 0 24 24" fill="none"><path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13.5" r="3.2" stroke="currentColor" stroke-width="1.7"/></svg>
            </button>
            <input type="file" accept="image/*" id="avatar-file-input" class="hidden" />
            ${user.avatarUrl ? '<button type="button" class="avatar-remove-btn">Remove photo</button>' : ''}
          ` : ''}
        </div>
        <div>
          <p class="profile-name">${escapeHtml(user.displayName || user.username)}</p>
          <span class="profile-handle">@${escapeHtml(user.username)}</span>
        </div>
      </div>
      <p class="profile-bio">${escapeHtml(user.bio || (isSelf ? 'Add a short bio to tell people about yourself.' : ''))}</p>
      <div class="profile-stats">
        <span><b>${user.followers.length}</b> followers</span>
        <span><b>${user.following.length}</b> following</span>
        <span><b>${posts.length}</b> posts</span>
      </div>
    `;
    paintAvatar(head.querySelector('.avatar'), user);

    if (isSelf) {
      wireAvatarUpload(head, user);
    }

    if (isSelf) {
      const editForm = document.createElement('form');
      editForm.className = 'profile-edit-form';
      editForm.innerHTML = `
        <input name="displayName" placeholder="Display name" value="${escapeHtml(user.displayName || '')}" maxlength="40" />
        <textarea name="bio" placeholder="Short bio" maxlength="160" rows="2">${escapeHtml(user.bio || '')}</textarea>
        <button type="submit" class="btn-primary btn-small" style="align-self:flex-start;">Save profile</button>
      `;
      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(editForm);
        try {
          const res = await api('/users/me/update', {
            method: 'PUT',
            body: { displayName: fd.get('displayName'), bio: fd.get('bio') },
          });
          state.me.displayName = res.user.displayName;
          state.me.bio = res.user.bio;
          toast('Profile saved', 'success');
          loadProfile(username);
        } catch (err) {
          toast(err.message);
        }
      });
      head.appendChild(editForm);
    } else {
      const followBtn = document.createElement('button');
      followBtn.className = 'follow-btn';
      const following = isFollowing(user._id);
      followBtn.textContent = following ? 'Following' : 'Follow';
      followBtn.classList.toggle('following', following);
      followBtn.style.marginTop = '14px';
      followBtn.addEventListener('click', async () => {
        try {
          const res = await api(`/users/${user._id}/follow`, { method: 'POST' });
          state.me.following = res.following
            ? [...state.me.following, user._id]
            : state.me.following.filter((id) => String(id) !== String(user._id));
          loadProfile(username);
        } catch (err) {
          toast(err.message);
        }
      });
      head.appendChild(followBtn);
    }

    wrap.appendChild(head);
    feedList.innerHTML = '';
    feedList.appendChild(wrap);

    if (!posts.length) {
      feedList.insertAdjacentHTML('beforeend', '<p class="empty-state">No posts yet.</p>');
    } else {
      posts.forEach((post) => feedList.appendChild(renderPostCard(post)));
    }
  } catch (err) {
    feedList.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
    toast(err.message);
  }
}

// ---------- saved posts ----------
async function loadSaved() {
  feedList.innerHTML = '<p class="empty-state">Loading saved posts…</p>';
  try {
    const posts = await api('/posts/bookmarked/mine');
    if (!posts.length) {
      feedList.innerHTML = '<p class="empty-state">Nothing saved yet. Tap the bookmark icon on any post to save it for later.</p>';
      return;
    }
    feedList.innerHTML = '';
    posts.forEach((post) => feedList.appendChild(renderPostCard(post)));
  } catch (err) {
    feedList.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
    toast(err.message);
  }
}

// ---------- people directory (explore & connect with sample friends) ----------
async function loadPeoplePage() {
  feedList.innerHTML = '<p class="empty-state">Loading people…</p>';
  try {
    const users = await api('/users');
    if (!users.length) {
      feedList.innerHTML = '<p class="empty-state">No one else has joined yet. Run <code>npm run seed</code> to add sample friends.</p>';
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'people-grid';
    users.forEach((u) => grid.appendChild(renderPersonCard(u)));
    feedList.innerHTML = '';
    feedList.appendChild(grid);
  } catch (err) {
    feedList.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
    toast(err.message);
  }
}

function renderPersonCard(u) {
  const card = document.createElement('div');
  card.className = 'person-card';

  const av = document.createElement('div');
  av.className = 'avatar';
  paintAvatar(av, u);

  const name = document.createElement('div');
  name.className = 'person-card-name';
  name.textContent = u.displayName || u.username;

  const handle = document.createElement('div');
  handle.className = 'person-card-handle';
  handle.textContent = `@${u.username}`;

  const bio = document.createElement('div');
  bio.className = 'person-card-bio';
  bio.textContent = u.bio || 'No bio yet.';

  const followBtn = document.createElement('button');
  followBtn.className = 'follow-btn';
  const following = isFollowing(u._id);
  followBtn.textContent = following ? 'Following' : 'Follow';
  followBtn.classList.toggle('following', following);
  followBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      const res = await api(`/users/${u._id}/follow`, { method: 'POST' });
      state.me.following = res.following
        ? [...state.me.following, u._id]
        : state.me.following.filter((id) => String(id) !== String(u._id));
      followBtn.textContent = res.following ? 'Following' : 'Follow';
      followBtn.classList.toggle('following', res.following);
    } catch (err) {
      toast(err.message);
    }
  });

  card.append(av, name, handle, bio, followBtn);
  card.addEventListener('click', () => openProfile(u.username));
  return card;
}

// ---------- profile photo upload ----------
function resizeImageFile(file, size = 320, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = size / Math.min(img.width, img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        // center-crop to a square so avatars aren't stretched or off-center
        ctx.drawImage(img, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

function wireAvatarUpload(head, user) {
  const wrap = head.querySelector('.avatar-upload-wrap');
  const avatarEl = head.querySelector('.profile-avatar');
  const editBtn = head.querySelector('.avatar-edit-btn');
  const fileInput = head.querySelector('#avatar-file-input');
  const removeBtn = head.querySelector('.avatar-remove-btn');

  editBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Please choose an image file.');
      return;
    }

    wrap.classList.add('uploading');
    try {
      const dataUrl = await resizeImageFile(file);
      const res = await api('/users/me/avatar', { method: 'PUT', body: { image: dataUrl } });
      state.me.avatarUrl = res.user.avatarUrl;
      paintAvatar(avatarEl, res.user);
      paintAvatar(document.getElementById('composer-avatar'), state.me);
      wrap.classList.add('just-updated');
      setTimeout(() => wrap.classList.remove('just-updated'), 900);
      toast('Profile photo updated', 'success');
      loadSuggested();
    } catch (err) {
      toast(err.message);
    } finally {
      wrap.classList.remove('uploading');
      fileInput.value = '';
    }
  });

  if (removeBtn) {
    removeBtn.addEventListener('click', async () => {
      wrap.classList.add('uploading');
      try {
        const res = await api('/users/me/avatar', { method: 'DELETE' });
        state.me.avatarUrl = res.user.avatarUrl;
        paintAvatar(avatarEl, res.user);
        paintAvatar(document.getElementById('composer-avatar'), state.me);
        removeBtn.remove();
        toast('Photo removed', 'success');
      } catch (err) {
        toast(err.message);
      } finally {
        wrap.classList.remove('uploading');
      }
    });
  }
}

boot();
