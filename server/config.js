'use strict';

require('dotenv').config();

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = int('PORT', 3000);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

module.exports = {
  NODE_ENV,
  PORT,
  IS_PROD: NODE_ENV === 'production',
  SESSION_EXPIRY_MS: int('SESSION_EXPIRY_MS', 30 * 60 * 1000),
  SESSION_CLEANUP_INTERVAL_MS: int('SESSION_CLEANUP_INTERVAL_MS', 60 * 1000),
  MAX_SESSIONS: int('MAX_SESSIONS', 500),
  ALLOWED_ORIGINS,
  MAX_PAYLOAD_BYTES: int('MAX_PAYLOAD_BYTES', 1024 * 1024),
  WS_RATE_LIMIT_PER_MIN: int('WS_RATE_LIMIT_PER_MIN', 120),
  SESSION_CODE_REGEX: /^[A-Z0-9-]{6,25}$/,
  SESSION_CODE_PREFIX: 'DRAW-',

  // TURN relay configuration (optional but strongly recommended
  // for reliable WebRTC across mobile carriers and strict NATs).
  TURN_URL: process.env.TURN_URL || '',
  TURN_USERNAME: process.env.TURN_USERNAME || '',
  TURN_CREDENTIAL: process.env.TURN_CREDENTIAL || '',
};