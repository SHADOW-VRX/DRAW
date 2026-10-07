'use strict';

const http = require('http');
const path = require('path');
const express = require('express');

const config = require('./config');
const sessions = require('./services/sessionService');
const sessionRoutes = require('./routes/sessionRoutes');
const { initSignaling } = require('./websocket/signaling');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // Render sits behind a proxy.

// Security headers.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(self), microphone=(), geolocation=()'
  );
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob: mediastream:",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' ws: wss:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  next();
});

// Body parsing with size limits.
app.use(express.json({ limit: '64kb' }));

// CORS for the API routes (WebSocket handles its own origin check).
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && config.ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/api', sessionRoutes);

// Static frontend.
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    extensions: ['html'],
    maxAge: config.IS_PROD ? '1h' : 0,
  })
);

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handler — never leak stack traces.
app.use((err, _req, res, _next) => {
  console.error('[server] error:', err.message);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: 'Internal server error.' });
});

const server = http.createServer(app);
const wss = initSignaling(server);

sessions.start();

// Bind to 0.0.0.0 so Render's proxy can reach the service.
const PORT = config.PORT;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`DRAW server listening on port ${PORT} (${config.NODE_ENV})`);
});

function shutdown() {
  console.log('\nShutting down…');
  sessions.stop();
  wss.clients.forEach((c) => {
    try { c.close(); } catch {}
  });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);