'use strict';

const crypto = require('crypto');
const config = require('../config');

/**
 * In-memory session store. Sessions are short-lived and ephemeral by design,
 * so no external database is required. Optional JSON snapshotting is provided
 * for observability but is not used for session recovery.
 */
class SessionService {
  constructor() {
    /** @type {Map<string, Session>} */
    this.sessions = new Map();
    this.cleanupTimer = null;
  }

  start() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.cleanup(), config.SESSION_CLEANUP_INTERVAL_MS);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  stop() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  /** Cryptographically strong, human-friendly code. No ambiguous chars. */
  generateCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(10);
    let code = '';
    for (let i = 0; i < 10; i++) code += alphabet[bytes[i] % alphabet.length];
    return `${config.SESSION_CODE_PREFIX}${code}`;
  }

  create() {
    if (this.sessions.size >= config.MAX_SESSIONS) {
      const err = new Error('Session capacity reached. Try again shortly.');
      err.status = 503;
      throw err;
    }

    let code;
    let attempts = 0;
    do {
      code = this.generateCode();
      attempts++;
      if (attempts > 20) throw new Error('Unable to generate unique session code.');
    } while (this.sessions.has(code));

    const now = Date.now();
    const session = {
      code,
      createdAt: now,
      expiresAt: now + config.SESSION_EXPIRY_MS,
      controller: null,
      viewer: null,
      streamState: { active: false, output: null },
    };
    this.sessions.set(code, session);
    return session;
  }

  get(code) {
    const s = this.sessions.get(code);
    if (!s) return null;
    if (s.expiresAt <= Date.now()) {
      this.destroy(code);
      return null;
    }
    return s;
  }

  isValidCode(code) {
    return typeof code === 'string' && config.SESSION_CODE_REGEX.test(code);
  }

  attachController(code, socketId, meta = {}) {
    const s = this.get(code);
    if (!s) return { ok: false, reason: 'not-found' };
    if (s.controller && s.controller.socketId !== socketId) {
      return { ok: false, reason: 'controller-exists' };
    }
    s.controller = {
      socketId,
      joinedAt: Date.now(),
      meta: sanitizeMeta(meta),
    };
    return { ok: true, session: s };
  }

  attachViewer(code, socketId, meta = {}) {
    const s = this.get(code);
    if (!s) return { ok: false, reason: 'not-found' };
    if (!s.controller) return { ok: false, reason: 'no-controller' };
    if (s.viewer && s.viewer.socketId !== socketId) {
      return { ok: false, reason: 'viewer-exists' };
    }
    s.viewer = {
      socketId,
      joinedAt: Date.now(),
      meta: sanitizeMeta(meta),
    };
    return { ok: true, session: s };
  }

  detach(socketId) {
    const affected = [];
    for (const [code, s] of this.sessions) {
      let changed = false;
      if (s.controller && s.controller.socketId === socketId) {
        s.controller = null;
        changed = true;
      }
      if (s.viewer && s.viewer.socketId === socketId) {
        s.viewer = null;
        changed = true;
      }
      if (changed) affected.push(code);
    }
    return affected;
  }

  destroy(code) {
    this.sessions.delete(code);
  }

  cleanup() {
    const now = Date.now();
    for (const [code, s] of this.sessions) {
      if (s.expiresAt <= now) this.sessions.delete(code);
    }
  }

  /** Public snapshot — never exposes socket ids to clients. */
  publicInfo(code) {
    const s = this.get(code);
    if (!s) return null;
    return {
      code: s.code,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      hasController: !!s.controller,
      hasViewer: !!s.viewer,
      streamState: s.streamState,
    };
  }
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const out = {};
  if (typeof meta.userAgent === 'string') out.userAgent = meta.userAgent.slice(0, 200);
  if (typeof meta.role === 'string') out.role = meta.role.slice(0, 20);
  return out;
}

module.exports = new SessionService();