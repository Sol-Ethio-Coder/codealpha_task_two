const express = require('express');
const User = require('../models/User');
const Post = require('../models/Post');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route GET /api/users  (search / list, used for "discover people")
router.get('/', protect, async (req, res) => {
  try {
    const { q } = req.query;
    const filter = q
      ? { username: { $regex: q, $options: 'i' }, _id: { $ne: req.user._id } }
      : { _id: { $ne: req.user._id } };
    const users = await User.find(filter).limit(20);
    res.json(users.map((u) => u.toPublicJSON()));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route GET /api/users/:username
router.get('/:username', protect, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const posts = await Post.find({ author: user._id })
      .populate('author', 'username displayName avatarColor avatarUrl')
      .populate('comments.author', 'username displayName avatarColor avatarUrl')
      .sort('-createdAt');

    res.json({ user: user.toPublicJSON(), posts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route PUT /api/users/me  (update own profile)
router.put('/me/update', protect, async (req, res) => {
  try {
    const { displayName, bio } = req.body;
    const user = await User.findById(req.user._id);
    if (displayName !== undefined) user.displayName = displayName.slice(0, 40);
    if (bio !== undefined) user.bio = bio.slice(0, 160);
    await user.save();
    res.json({ user: user.toPublicJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route PUT /api/users/me/avatar  (upload/replace profile photo)
// Expects { image: "data:image/jpeg;base64,...." } — resized/compressed client-side first.
router.put('/me/avatar', protect, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ message: 'A valid image is required' });
    }
    // Rough size guard — a resized/compressed avatar should be well under this.
    // (Base64 inflates size ~33%, so ~2.7MB of text ≈ 2MB of actual image data.)
    if (image.length > 2_800_000) {
      return res.status(400).json({ message: 'Image is too large. Try a smaller photo.' });
    }

    const user = await User.findById(req.user._id);
    user.avatarUrl = image;
    await user.save();
    res.json({ user: user.toPublicJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route DELETE /api/users/me/avatar  (remove photo, fall back to initials avatar)
router.delete('/me/avatar', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.avatarUrl = null;
    await user.save();
    res.json({ user: user.toPublicJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route POST /api/users/:id/follow  (toggle follow/unfollow)
router.post('/:id/follow', protect, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === String(req.user._id)) {
      return res.status(400).json({ message: "You can't follow yourself" });
    }

    const target = await User.findById(targetId);
    const me = await User.findById(req.user._id);
    if (!target) return res.status(404).json({ message: 'User not found' });

    const alreadyFollowing = me.following.some((id) => String(id) === targetId);

    if (alreadyFollowing) {
      me.following = me.following.filter((id) => String(id) !== targetId);
      target.followers = target.followers.filter((id) => String(id) !== String(me._id));
    } else {
      me.following.push(target._id);
      target.followers.push(me._id);
    }

    await me.save();
    await target.save();

    res.json({
      following: !alreadyFollowing,
      user: target.toPublicJSON(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
