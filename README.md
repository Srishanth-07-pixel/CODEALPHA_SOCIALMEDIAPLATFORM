# Echo — Social Media Platform
### CodeAlpha Full Stack Internship — Task 2

A full-stack social media application built with **Express.js**, **SQLite**, and vanilla **HTML/CSS/JS**.

---

## 🚀 Features

- **User Authentication** — Register & Login with JWT tokens + bcrypt password hashing
- **User Profiles** — View any user's profile, bio, follower/following counts
- **Edit Profile** — Update bio and upload avatar photo
- **Posts** — Create posts with optional images, delete your own posts
- **Feed** — "Following" feed (posts from people you follow) + "All Posts" global feed
- **Likes** — Like/unlike posts with live count updates
- **Comments** — Comment on any post via modal popup
- **Follow System** — Follow/unfollow users; suggested users panel
- **Explore** — Search users by username + browse all posts
- **Responsive Dark UI** — Modern dark theme with smooth animations

---

## 🛠 Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | HTML5, CSS3, Vanilla JavaScript     |
| Backend   | Node.js + Express.js                |
| Database  | SQLite via better-sqlite3           |
| Auth      | JWT (jsonwebtoken) + bcryptjs       |
| Uploads   | Multer (local disk storage)         |

---

## 📁 Project Structure

```
social-app/
├── server.js          # Express server + all API routes
├── database.js        # SQLite schema setup
├── package.json
├── social.db          # Auto-generated SQLite database
├── uploads/           # User uploaded images (auto-created)
└── public/
    ├── index.html     # Single Page Application
    ├── style.css      # Dark theme UI styles
    └── app.js         # Frontend logic (no framework)
```

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint              | Description       |
|--------|-----------------------|-------------------|
| POST   | `/api/auth/register`  | Create account    |
| POST   | `/api/auth/login`     | Login             |

### Users
| Method | Endpoint                      | Description          |
|--------|-------------------------------|----------------------|
| GET    | `/api/users/:username`        | Get profile          |
| PUT    | `/api/users/profile/update`   | Update bio/avatar    |
| GET    | `/api/users?q=`               | Search users         |
| GET    | `/api/users/:id/followers`    | List followers       |
| GET    | `/api/users/:id/following`    | List following       |

### Posts
| Method | Endpoint                  | Description           |
|--------|---------------------------|-----------------------|
| POST   | `/api/posts`              | Create post           |
| GET    | `/api/posts/feed`         | All posts feed        |
| GET    | `/api/posts/following`    | Following feed        |
| GET    | `/api/posts/:id`          | Single post           |
| GET    | `/api/users/:u/posts`     | User's posts          |
| DELETE | `/api/posts/:id`          | Delete post           |

### Interactions
| Method | Endpoint                    | Description     |
|--------|-----------------------------|-----------------|
| POST   | `/api/posts/:id/like`       | Toggle like     |
| GET    | `/api/posts/:id/comments`   | Get comments    |
| POST   | `/api/posts/:id/comments`   | Add comment     |
| DELETE | `/api/comments/:id`         | Delete comment  |
| POST   | `/api/follow/:userId`       | Toggle follow   |

---

## ⚡ Setup & Run

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start
# or for development with auto-reload:
npm run dev

# 3. Open in browser
http://localhost:3000
```

---

## 📦 GitHub Repository Name
`CodeAlpha_SocialMediaPlatform`
