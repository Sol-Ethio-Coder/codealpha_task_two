# Pulse — Mini Social Media App

Express.js + MongoDB Atlas + vanilla JS/HTML/CSS. User profiles, posts, comments, likes, and a follow system, with a dark, distinctive UI ("Pulse" — a heartbeat theme).

## Features

- **Auth** — register/login with hashed passwords (bcrypt) and JWT sessions
- **User profiles** — display name, bio, avatar (auto-generated from initials + color)
- **Posts** — create, edit, delete; feed of people you follow, "Discover" (everyone), or "Trending" (most-liked)
- **Comments** — add/delete comments on any post (post owner can also moderate)
- **Likes** — toggle like on posts, live count
- **Follow system** — follow/unfollow, followers/following counts, search people by username
- **Profile photos** — upload, replace, or remove your profile picture; resized and compressed to a square right in the browser before upload, with a spinning-ring upload animation and a little "pop" when it lands
- **Animated background** — soft drifting gradient glow behind the whole app (respects `prefers-reduced-motion`)
- **Notifications** — a bell in the rail shows likes and comments on your own posts, with an unread-count badge
- **Saved posts** — bookmark any post and revisit it from the "Saved" tab
- **People directory** — a dedicated "People" page with a card grid of everyone on the app (bio, follow button) — the fastest way to find and connect with the sample friends
- **Profile photo upload** — replace your initials avatar with a real photo; resized/compressed to a square client-side before upload, with a spinning-ring loading state and a pop animation on success
- **Animated background** — two soft, slow-drifting gradient blobs behind the whole app (respects `prefers-reduced-motion`)
- **Sample friends** — a seed script (`npm run seed`) creates 6 demo accounts, mutual follows, and sample posts/likes/comments so there's something to interact with right away
- **Favicon** — a small pulse-line mark, `public/favicon.svg`
- **Developer credit** — a small glowing pill-badge footer on every screen, linking to Sol Ethio Coder

## What was fixed

If posting wasn't working before, it was almost certainly this: the server used
`app.get('*', ...)` as a catch-all fallback route. On Express 5 / newer
`path-to-regexp` versions, a bare `'*'` throws at startup ("Missing parameter
name"), which can crash the server or leave routes unregistered depending on
your exact dependency versions — every request, including posting, then fails.
`server.js` now uses a plain catch-all middleware instead (`app.use((req, res) => ...)`),
which works the same on Express 4 and 5.

On top of that:
- A leftover duplicate avatar-upload route (a disk-based `multer` implementation
  that had crept in alongside the new one) was removed. It required a package
  that wasn't in `package.json`, so the server crashed on startup with
  `Cannot find module 'multer'` — every single request, including posting,
  would have failed because the server never came up at all. Profile photos
  now use a single, consistent approach: resize/compress to a small square
  JPEG in the browser, send it as a base64 string, store it directly on the
  user document. No disk storage, no extra dependency, and it works the same
  whether you run this locally or deploy it anywhere (some hosts wipe local
  disk storage between deploys, which would have silently deleted uploaded
  photos with the old approach).
- Any unmatched `/api/*` route now returns a proper JSON 404 instead of
  silently falling through to the HTML page (which used to make the frontend
  choke trying to parse HTML as JSON and fail with a vague error).
- A global Express error handler now catches anything a route didn't handle
  and always returns JSON.
- The frontend's `api()` helper no longer swallows errors — network failures,
  non-JSON responses, and API error messages all now surface as a toast in
  the bottom-right corner, and are logged to the browser console with detail.
- **Latest fix:** editing a post updated the text correctly but silently failed
  to refresh the "· edited" label next to the timestamp — it was looking for
  that element on a stale, already-emptied template reference instead of the
  actual post card on the page. It now updates the live card directly.

**If posting still doesn't work after pulling these changes**, open the
browser console (F12 → Console/Network tab) when you click "Post" and check
the status code and message — that'll tell us exactly what's failing
(auth token, database connection, validation, etc).

## Project structure

```
social-app/
├── server.js              # Express app entry point
├── config/db.js           # MongoDB Atlas connection
├── models/
│   ├── User.js            # users, followers/following
│   └── Post.js            # posts, embedded comments, likes
├── middleware/auth.js      # JWT verification
├── routes/
│   ├── auth.js             # register / login / me
│   ├── users.js            # profile, search, follow/unfollow
│   └── posts.js            # feed, create/delete, like, comments
└── public/                 # frontend (no build step needed)
    ├── index.html
    ├── css/style.css
    └── js/app.js
```

## 1. Set up MongoDB Atlas

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Under **Database Access**, create a database user with a username/password.
3. Under **Network Access**, add your IP (or `0.0.0.0/0` while developing).
4. Under **Database → Connect → Drivers**, copy the connection string. It looks like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

## 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/pulse-social?retryWrites=true&w=majority
JWT_SECRET=some_long_random_string
PORT=5000
```

## 3. Install & run

```bash
npm install
npm run dev     # nodemon, auto-restart
# or
npm start
```

Then open **http://localhost:5000** — the Express server also serves the frontend, so there's nothing else to start.

## 4. (Optional) Seed sample friends

To populate the app with 6 demo accounts that already follow each other and
have sample posts, likes, and comments:

```bash
npm run seed
```

This prints the sample usernames — log in as any of them (password:
`password123`) to see a populated feed, or just register your own account and
follow the sample friends from the "Discover" tab. Safe to re-run; it only
touches the sample accounts it creates.

## API overview

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Log in |
| GET | `/api/auth/me` | Current user (requires token) |
| GET | `/api/users?q=` | Search users |
| GET | `/api/users/:username` | Profile + their posts |
| PUT | `/api/users/me/update` | Update display name / bio |
| PUT | `/api/users/me/avatar` | Upload/replace profile photo (base64 image) |
| DELETE | `/api/users/me/avatar` | Remove profile photo |
| PUT | `/api/users/me/avatar` | Upload/replace profile photo (base64 image) |
| DELETE | `/api/users/me/avatar` | Remove profile photo |
| POST | `/api/users/:id/follow` | Toggle follow/unfollow |
| GET | `/api/posts?scope=following\|all\|trending` | Feed (default: following) |
| GET | `/api/posts/notifications/mine` | Recent likes/comments on your posts |
| POST | `/api/posts` | Create post |
| PUT | `/api/posts/:id` | Edit own post |
| DELETE | `/api/posts/:id` | Delete own post |
| POST | `/api/posts/:id/like` | Toggle like |
| POST | `/api/posts/:id/comments` | Add comment |
| DELETE | `/api/posts/:id/comments/:commentId` | Delete comment |
| POST | `/api/posts/:id/bookmark` | Toggle save/unsave a post |
| GET | `/api/posts/bookmarked/mine` | Your saved posts |

All routes except register/login require an `Authorization: Bearer <token>` header — the frontend handles this automatically once you log in.

## Notes

- Comments are stored as sub-documents inside each `Post`, so a post and its comments load in a single query.
- Passwords are hashed with bcrypt before saving; raw passwords are never stored.
- The frontend is plain HTML/CSS/JS (no framework, no build step) — open `public/js/app.js` to see how it talks to the API.
