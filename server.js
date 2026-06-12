const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const path       = require('path');
const multer     = require('multer');
const fs         = require('fs');
const db         = require('./database');

const app    = express();
const PORT   = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'echo_social_secret_2024';

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Multer (image uploads) ───────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── Auth Middleware ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Register
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields required' });

  try {
    const hashed = await bcrypt.hash(password, 10);
    const stmt = db.prepare(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)'
    );
    const result = stmt.run(username, email, hashed);
    const token = jwt.sign({ id: result.lastInsertRowid, username }, SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: result.lastInsertRowid, username, email } });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      res.status(409).json({ error: 'Username or email already taken' });
    } else {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, email: user.email, bio: user.bio, avatar: user.avatar } });
});

// ════════════════════════════════════════════════════════════════════════════
//  USER ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Get profile
app.get('/api/users/:username', authMiddleware, (req, res) => {
  const { username } = req.params;
  const profile = db.prepare(`
    SELECT id, username, bio, avatar, created_at,
      (SELECT COUNT(*) FROM follows WHERE following_id = users.id) AS followers_count,
      (SELECT COUNT(*) FROM follows WHERE follower_id  = users.id) AS following_count,
      (SELECT COUNT(*) FROM posts    WHERE user_id     = users.id) AS posts_count
    FROM users WHERE username = ?
  `).get(username);

  if (!profile) return res.status(404).json({ error: 'User not found' });

  const isFollowing = db.prepare(
    'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?'
  ).get(req.user.id, profile.id);

  res.json({ ...profile, isFollowing: !!isFollowing });
});

// Update profile
app.put('/api/users/profile/update', authMiddleware, upload.single('avatar'), (req, res) => {
  const { bio } = req.body;
  const avatar  = req.file ? `/uploads/${req.file.filename}` : undefined;

  const fields = [];
  const values = [];
  if (bio !== undefined)    { fields.push('bio = ?');    values.push(bio); }
  if (avatar !== undefined) { fields.push('avatar = ?'); values.push(avatar); }

  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

  values.push(req.user.id);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT id, username, email, bio, avatar FROM users WHERE id = ?').get(req.user.id);
  res.json(updated);
});

// Search users
app.get('/api/users', authMiddleware, (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const users = db.prepare(
    'SELECT id, username, bio, avatar FROM users WHERE username LIKE ? LIMIT 20'
  ).all(q);
  res.json(users);
});

// ════════════════════════════════════════════════════════════════════════════
//  FOLLOW ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Follow / Unfollow
app.post('/api/follow/:userId', authMiddleware, (req, res) => {
  const followingId = parseInt(req.params.userId);
  if (followingId === req.user.id)
    return res.status(400).json({ error: "Can't follow yourself" });

  const exists = db.prepare(
    'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?'
  ).get(req.user.id, followingId);

  if (exists) {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?')
      .run(req.user.id, followingId);
    res.json({ following: false });
  } else {
    db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)')
      .run(req.user.id, followingId);
    res.json({ following: true });
  }
});

// Get followers list
app.get('/api/users/:userId/followers', authMiddleware, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.avatar FROM users u
    JOIN follows f ON f.follower_id = u.id
    WHERE f.following_id = ?
  `).all(req.params.userId);
  res.json(users);
});

// Get following list
app.get('/api/users/:userId/following', authMiddleware, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.avatar FROM users u
    JOIN follows f ON f.following_id = u.id
    WHERE f.follower_id = ?
  `).all(req.params.userId);
  res.json(users);
});

// ════════════════════════════════════════════════════════════════════════════
//  POST ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Create post
app.post('/api/posts', authMiddleware, upload.single('image'), (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim())
    return res.status(400).json({ error: 'Content required' });

  const image  = req.file ? `/uploads/${req.file.filename}` : '';
  const result = db.prepare(
    'INSERT INTO posts (user_id, content, image) VALUES (?, ?, ?)'
  ).run(req.user.id, content.trim(), image);

  const post = db.prepare(`
    SELECT p.*, u.username, u.avatar,
      0 AS likes_count, 0 AS comments_count, 0 AS liked_by_me
    FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(post);
});

// Global feed (all posts, newest first)
app.get('/api/posts/feed', authMiddleware, (req, res) => {
  const limit  = parseInt(req.query.limit)  || 20;
  const offset = parseInt(req.query.offset) || 0;

  const posts = db.prepare(`
    SELECT p.*, u.username, u.avatar,
      (SELECT COUNT(*) FROM likes    WHERE post_id = p.id) AS likes_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comments_count,
      (SELECT COUNT(*) FROM likes    WHERE post_id = p.id AND user_id = ?) AS liked_by_me
    FROM posts p JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, limit, offset);

  res.json(posts);
});

// Following feed
app.get('/api/posts/following', authMiddleware, (req, res) => {
  const limit  = parseInt(req.query.limit)  || 20;
  const offset = parseInt(req.query.offset) || 0;

  const posts = db.prepare(`
    SELECT p.*, u.username, u.avatar,
      (SELECT COUNT(*) FROM likes    WHERE post_id = p.id) AS likes_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comments_count,
      (SELECT COUNT(*) FROM likes    WHERE post_id = p.id AND user_id = ?) AS liked_by_me
    FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.user_id IN (
      SELECT following_id FROM follows WHERE follower_id = ?
    ) OR p.user_id = ?
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, req.user.id, req.user.id, limit, offset);

  res.json(posts);
});

// Get single post
app.get('/api/posts/:id', authMiddleware, (req, res) => {
  const post = db.prepare(`
    SELECT p.*, u.username, u.avatar,
      (SELECT COUNT(*) FROM likes    WHERE post_id = p.id) AS likes_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comments_count,
      (SELECT COUNT(*) FROM likes    WHERE post_id = p.id AND user_id = ?) AS liked_by_me
    FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).get(req.user.id, req.params.id);

  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json(post);
});

// Get user posts
app.get('/api/users/:username/posts', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const posts = db.prepare(`
    SELECT p.*, u.username, u.avatar,
      (SELECT COUNT(*) FROM likes    WHERE post_id = p.id) AS likes_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comments_count,
      (SELECT COUNT(*) FROM likes    WHERE post_id = p.id AND user_id = ?) AS liked_by_me
    FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
  `).all(req.user.id, user.id);

  res.json(posts);
});

// Delete post
app.delete('/api/posts/:id', authMiddleware, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ message: 'Post deleted' });
});

// ════════════════════════════════════════════════════════════════════════════
//  LIKE ROUTES
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/posts/:id/like', authMiddleware, (req, res) => {
  const postId = parseInt(req.params.id);
  const exists = db.prepare(
    'SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?'
  ).get(postId, req.user.id);

  if (exists) {
    db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(postId, req.user.id);
  } else {
    db.prepare('INSERT INTO likes (post_id, user_id) VALUES (?, ?)').run(postId, req.user.id);
  }

  const count = db.prepare('SELECT COUNT(*) AS c FROM likes WHERE post_id = ?').get(postId).c;
  res.json({ liked: !exists, likes_count: count });
});

// ════════════════════════════════════════════════════════════════════════════
//  COMMENT ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Get comments for a post
app.get('/api/posts/:id/comments', authMiddleware, (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, u.username, u.avatar
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.id);
  res.json(comments);
});

// Add comment
app.post('/api/posts/:id/comments', authMiddleware, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim())
    return res.status(400).json({ error: 'Comment content required' });

  const result = db.prepare(
    'INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)'
  ).run(req.params.id, req.user.id, content.trim());

  const comment = db.prepare(`
    SELECT c.*, u.username, u.avatar FROM comments c
    JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(comment);
});

// Delete comment
app.delete('/api/comments/:id', authMiddleware, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ message: 'Comment deleted' });
});


app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(PORT, "0.0.0.0", ()  => {
  console.log(`🚀 Echo Social running at http://localhost:${PORT}`);
});
