const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 40,
    },
    bio: {
      type: String,
      maxlength: 160,
      default: '',
    },
    avatarColor: {
      // used to generate a deterministic gradient avatar when there's no photo
      type: String,
      default: () => '#6C5CE7',
    },
    avatarUrl: {
      // relative path under /uploads once the user uploads a real photo
      type: String,
      default: null,
    },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.toPublicJSON = function () {
  return {
    _id: this._id,
    username: this.username,
    displayName: this.displayName || this.username,
    bio: this.bio,
    avatarColor: this.avatarColor,
    avatarUrl: this.avatarUrl,
    followers: this.followers,
    following: this.following,
    bookmarks: this.bookmarks,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
