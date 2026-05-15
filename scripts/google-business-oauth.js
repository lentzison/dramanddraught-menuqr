#!/usr/bin/env node
/**
 * One-shot Google Business Profile OAuth helper.
 *
 * Usage:
 *   node scripts/google-business-oauth.js
 *
 * It:
 *   1. Prints an auth URL with the business.manage scope.
 *   2. Spins up a tiny local server on :3000 to catch the redirect.
 *   3. Exchanges the code for tokens and prints the refresh_token.
 *
 * Prerequisites in .env:
 *   GOOGLE_BUSINESS_CLIENT_ID
 *   GOOGLE_BUSINESS_CLIENT_SECRET
 *   GOOGLE_BUSINESS_REDIRECT_URI=http://localhost:3000/admin/google/oauth/callback
 *
 * Run this ONLY after Google approves the Business Profile API access request
 * (otherwise calls to the Business Profile APIs will 403 even with a valid token).
 */

require('dotenv').config();
const http = require('http');
const { URL } = require('url');

const CLIENT_ID = process.env.GOOGLE_BUSINESS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_BUSINESS_CLIENT_SECRET;
const REDIRECT_URI =
  process.env.GOOGLE_BUSINESS_REDIRECT_URI ||
  'http://localhost:3000/admin/google/oauth/callback';
const SCOPE = 'https://www.googleapis.com/auth/business.manage';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'Missing GOOGLE_BUSINESS_CLIENT_ID or GOOGLE_BUSINESS_CLIENT_SECRET in .env',
  );
  process.exit(1);
}

const redirect = new URL(REDIRECT_URI);
const PORT = Number(redirect.port) || 3000;
const CALLBACK_PATH = redirect.pathname;

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  }).toString();

console.log('\nOpen this URL in a browser signed in as a Dram & Draught Google Business Profile owner:\n');
console.log(authUrl);
console.log('\nWaiting for redirect on ' + REDIRECT_URI + ' ...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== CALLBACK_PATH) {
    res.writeHead(404).end('not found');
    return;
  }
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  if (err || !code) {
    res.writeHead(400, { 'content-type': 'text/plain' }).end('OAuth error: ' + (err || 'no code'));
    console.error('OAuth error:', err || 'no code');
    server.close();
    process.exit(1);
  }

  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const tokens = await tokenResp.json();

    if (!tokenResp.ok) {
      res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify(tokens, null, 2));
      console.error('Token exchange failed:', tokens);
      server.close();
      process.exit(1);
    }

    res
      .writeHead(200, { 'content-type': 'text/html' })
      .end('<h1>Done.</h1><p>You can close this tab. Refresh token printed in the terminal.</p>');

    console.log('\n--- TOKENS ---');
    console.log(JSON.stringify(tokens, null, 2));
    if (tokens.refresh_token) {
      console.log('\nAdd to .env:');
      console.log('GOOGLE_BUSINESS_REFRESH_TOKEN=' + tokens.refresh_token);
    } else {
      console.log('\nNo refresh_token returned. Revoke the app at https://myaccount.google.com/permissions and re-run.');
    }
    server.close();
  } catch (e) {
    console.error(e);
    res.writeHead(500).end('error');
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}${CALLBACK_PATH}`);
});
