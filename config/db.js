const mongoose = require('mongoose');

const connectDB = async () => {
  // On Vercel, this module can run again on a "warm" invocation without a
  // fresh process — skip reconnecting if we're already connected/connecting.
  if (mongoose.connection.readyState !== 0) return;

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Atlas connected: ${conn.connection.host}`);
  } catch (err) {
    // Don't process.exit() here — this file runs inside a serverless function
    // on Vercel, where exiting the process would just crash that invocation.
    // Log it clearly instead; requests that need the DB will fail with a
    // normal 500 until the connection succeeds.
    console.error(`❌ MongoDB connection error: ${err.message}`);
  }
};

module.exports = connectDB;
