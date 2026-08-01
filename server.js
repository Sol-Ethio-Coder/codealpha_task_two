require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');

const app = express();

connectDB();

app.use(cors());
// Raised from Express's 100kb default so a resized/compressed avatar photo
// (sent as a base64 data URL) fits in a single request.
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Unknown API route -> JSON 404 (never fall through to the HTML page,
// or the frontend silently gets HTML back instead of JSON and every
// request looks like a mysterious failure)
app.use('/api', (req, res) => {
  res.status(404).json({ message: `No API route: ${req.method} ${req.originalUrl}` });
});

// Fallback to index.html for any other (non-API) route — a simple SPA catch-all.
// Using middleware with no path pattern instead of app.get('*', ...): Express 5 /
// path-to-regexp 6+ rejects a bare '*' at compile time ("Missing parameter name"),
// which would crash the whole server before it ever accepts a request. This form
// works identically on Express 4 and 5.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Centralized error handler — catches anything thrown/rejected that a route
// didn't handle itself, so the client always gets JSON back instead of an
// HTML stack trace page (which also breaks the frontend's res.json() parsing).
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Server error. Check the server logs for details.' });
});

const PORT = process.env.PORT || 5000;

// Vercel imports this file as a serverless function and calls the exported
// app directly on each request — it never runs `node server.js`, so
// `require.main === module` is only true for local/traditional hosting.
// Only bind a port in that case; Vercel would ignore app.listen() anyway,
// but this keeps local dev and Vercel using the exact same file cleanly.
if (require.main === module) {
  app.listen(PORT, () => console.log(`🚀 Pulse server running on http://localhost:${PORT}`));
}

module.exports = app;
