// Netlify Function entry point. Wraps the same Express app used for local
// dev and Vercel — no route logic is duplicated here.
//
// How requests reach this: netlify.toml redirects "/api/*" to
// "/.netlify/functions/api/api/:splat" (note "/api" appears twice on
// purpose — see the comment in netlify.toml). serverless-http's `basePath`
// option then strips the "/.netlify/functions/api" prefix, so the Express
// app still sees paths exactly like "/api/auth/login", matching its routes
// unchanged.

const serverless = require('serverless-http');
const app = require('../../server');

module.exports.handler = serverless(app, {
  basePath: '/.netlify/functions/api',
});
