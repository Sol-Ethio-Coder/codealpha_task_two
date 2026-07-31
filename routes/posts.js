const express = require('express');
const Post = require('../models/Post');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

const populatePost = (query) =>
  query
    .populate('author', 'username displayName avatarColor avatarUrl')
    .populate('comments.author', 'username displayName avatarColor avatarUrl')
    .populate('likes.user', 'username displayName avatarColor avatarUrl');

// @route GET /api/posts?scope=following|all|trending
router.get('/', protect, async (req, res) => {
  try {
    const authorIds = [req.user._id, ...req.user.following];
    const { scope } = req.query;
    const filter = scope === 'following' || !scope ? { author: { $in: authorIds } } : {};

    let posts = await populatePost(Post.find(filter).sort('-createdAt').limit(200));

    if (scope === 'trending') {
      posts = posts.sort((a, b) => b.likes.length - a.likes.length).slice(0, 50);
    }

    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route GET /api/posts/notifications/mine  (likes + comments on my posts, newest first)
router.get('/notifications/mine', protect, async (req, res) => {
  try {
    const myPosts = await populatePost(Post.find({ author: req.user._id }));

    const items = [];
    myPosts.forEach((post) => {
      post.likes.forEach((like) => {
        if (String(like.user._id) !== String(req.user._id)) {
          items.push({
            type: 'like',
            actor: like.user,
            postId: post._id,
            postText: post.text,
            createdAt: like.createdAt,
          });
        }
      });
      post.comments.forEach((c) => {
        if (String(c.author._id) !== String(req.user._id)) {
          items.push({
            type: 'comment',
            actor: c.author,
            postId: post._id,
            postText: post.text,
            commentText: c.text,
            createdAt: c.createdAt,
          });
        }
      });
    });

    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(items.slice(0, 40));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route POST /api/posts
router.post('/', protect, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Post text is required' });
    }
    const post = await Post.create({ author: req.user._id, text: text.trim() });
    const populated = await populatePost(Post.findById(post._id));
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route PUT /api/posts/:id  (edit own post)
router.put('/:id', protect, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Post text is required' });
    }
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (String(post.author) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only edit your own posts' });
    }
    post.text = text.trim();
    post.edited = true;
    await post.save();
    const populated = await populatePost(Post.findById(post._id));
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route DELETE /api/posts/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (String(post.author) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only delete your own posts' });
    }
    await post.deleteOne();
    res.json({ message: 'Post deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route POST /api/posts/:id/like  (toggle)
router.post('/:id/like', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const existing = post.likes.find((l) => String(l.user) === String(req.user._id));
    if (existing) {
      post.likes.pull({ _id: existing._id });
    } else {
      post.likes.push({ user: req.user._id });
    }
    await post.save();
    const populated = await populatePost(Post.findById(post._id));
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route POST /api/posts/:id/comments
router.post('/:id/comments', protect, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Comment text is required' });
    }
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    post.comments.push({ author: req.user._id, text: text.trim() });
    await post.save();
    const populated = await populatePost(Post.findById(post._id));
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route DELETE /api/posts/:id/comments/:commentId
router.delete('/:id/comments/:commentId', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const isCommentAuthor = String(comment.author) === String(req.user._id);
    const isPostAuthor = String(post.author) === String(req.user._id);
    if (!isCommentAuthor && !isPostAuthor) {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }

    comment.deleteOne();
    await post.save();
    const populated = await populatePost(Post.findById(post._id));
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route GET /api/posts/bookmarked/mine
router.get('/bookmarked/mine', protect, async (req, res) => {
  try {
    const me = await User.findById(req.user._id);
    const posts = await populatePost(Post.find({ _id: { $in: me.bookmarks } }).sort('-createdAt'));
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route POST /api/posts/:id/bookmark  (toggle save)
router.post('/:id/bookmark', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const me = await User.findById(req.user._id);
    const already = me.bookmarks.some((id) => String(id) === String(post._id));
    if (already) {
      me.bookmarks = me.bookmarks.filter((id) => String(id) !== String(post._id));
    } else {
      me.bookmarks.push(post._id);
    }
    await me.save();
    res.json({ bookmarked: !already, bookmarks: me.bookmarks });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
