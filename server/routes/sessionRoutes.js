'use strict';

const express = require('express');
const sessions = require('../services/sessionService');
const config = require('../config');

const router = express.Router();

// Health check — useful for Render's health probe and uptime monitors.
router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    env: config.NODE_ENV,
  });
});

// Public session status lookup.
router.get('/session/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!config.SESSION_CODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Invalid session code format.' });
  }
  const info = sessions.publicInfo(code);
  if (!info) return res.status(404).json({ error: 'Session not found or expired.' });
  res.json(info);
});

// ICE configuration for WebRTC. Served from the backend so TURN
// credentials are never embedded in the frontend bundle.
router.get('/ice-config', (_req, res) => {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (config.TURN_URL) {
    iceServers.push({
      urls: config.TURN_URL,
      username: config.TURN_USERNAME,
      credential: config.TURN_CREDENTIAL,
    });
  }
  // Short cache — credentials may rotate.
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.json({ iceServers });
});

module.exports = router;