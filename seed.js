// Populates the database with sample friends, posts, follows, likes and
// comments so there's something to look at right after setup.
//
// Usage:  npm run seed
// Safe to run more than once — it clears only the sample accounts it creates
// (usernames below) and re-seeds them; it never touches other users' data.

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./models/User');
const Post = require('./models/Post');

const PALETTE = ['#6C5CE7', '#00B894', '#E17055', '#0984E3', '#D63031', '#FDCB6E', '#00CEC9'];

const PEOPLE = [
  { username: 'maya_codes', displayName: 'Maya Chen', bio: 'Building small tools for big problems. Coffee-powered.' },
  { username: 'theo_writes', displayName: 'Theo Alvarez', bio: 'Notes on cities, transit, and why buses matter.' },
  { username: 'nadia_runs', displayName: 'Nadia Osei', bio: 'Marathon #4 this fall. Ask me about knee sleeves.' },
  { username: 'sam_plants', displayName: 'Sam Whitfield', bio: 'Balcony gardener. Tomatoes are winning this year.' },
  { username: 'ling_designs', displayName: 'Ling Zhou', bio: 'Product designer. Obsessed with good empty states.' },
  { username: 'jordan_reads', displayName: 'Jordan Brooks', bio: 'One book a week, mostly sci-fi, occasionally regret it.' },
];

const SAMPLE_PASSWORD = 'password123';

const POSTS = [
  'maya_codes: Finally fixed the bug that only happened on Tuesdays. Never asking why.',
  "theo_writes: Rode the new tram line today — 12 minutes shaved off my commute. Small wins.",
  'nadia_runs: 18 miles this morning. Legs are done, mind is somehow fine.',
  "sam_plants: First ripe tomato of the season! It's small but it's mine.",
  'ling_designs: Redesigned our empty state copy for the third time. Third time is the charm, right?',
  "jordan_reads: Finished a 700 page space opera in four days. No regrets, some sleep debt.",
  'maya_codes: Hot take: tabs vs spaces matters less than just picking one and moving on.',
  "theo_writes: Why do so few cities design their bus stops for actual weather?",
  'nadia_runs: Signed up for marathon #4. Send snacks.',
  "sam_plants: Basil is out of control. Please send pesto recipes.",
];

async function seed() {
  await connectDB();

  console.log('Seeding sample friends…');

  const created = [];
  for (const person of PEOPLE) {
    let user = await User.findOne({ username: person.username });
    if (!user) {
      user = await User.create({
        username: person.username,
        email: `${person.username}@example.com`,
        password: SAMPLE_PASSWORD,
        displayName: person.displayName,
        bio: person.bio,
        avatarColor: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      });
      console.log(`  created @${user.username}`);
    } else {
      console.log(`  @${user.username} already exists, reusing`);
    }
    created.push(user);
  }

  // Everyone follows everyone else (small, friendly demo network)
  for (const user of created) {
    const others = created.filter((u) => String(u._id) !== String(user._id));
    user.following = others.map((u) => u._id);
    user.followers = others.map((u) => u._id);
    await user.save();
  }
  console.log('Linked sample friends as mutual follows.');

  // Clear old sample posts so re-running doesn't pile up duplicates
  await Post.deleteMany({ author: { $in: created.map((u) => u._id) } });

  const savedPosts = [];
  for (const line of POSTS) {
    const [username, ...rest] = line.split(': ');
    const author = created.find((u) => u.username === username);
    if (!author) continue;
    const post = await Post.create({ author: author._id, text: rest.join(': ') });
    savedPosts.push(post);
  }
  console.log(`Created ${savedPosts.length} sample posts.`);

  // Sprinkle likes and a comment or two
  for (const post of savedPosts) {
    const likers = created.filter((u) => String(u._id) !== String(post.author)).slice(0, 3);
    post.likes = likers.map((u) => ({ user: u._id }));
    const commenter = created.find((u) => String(u._id) !== String(post.author));
    if (commenter) {
      post.comments.push({ author: commenter._id, text: 'Love this!' });
    }
    await post.save();
  }
  console.log('Added sample likes and comments.');

  console.log('\nDone! Sample accounts (all use the same password):');
  PEOPLE.forEach((p) => console.log(`  username: ${p.username}   password: ${SAMPLE_PASSWORD}`));
  console.log('\nLog in as any of them, or register your own account — you\'ll already');
  console.log('have a feed and people to follow either way.');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
