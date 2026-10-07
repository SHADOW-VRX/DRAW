'use strict';

const config = require('../config');

/**
 * Rate limiter + message validator for the WebSocket signaling layer.
 */
class SignalingService {
  constructor() {
    /** @type {Map<string, { count: number, resetAt: number }>} */
    this.buckets = new Map();
  }

  /** Returns true if the message is allowed, false if it should be dropped. */
  allow(socketId) {
    const now = Date.now();
    let b = this.buckets.get(socketId);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + 60_000 };
      this.buckets.set(socketId, b);
    }
    b.count++;
    return b.count <= config.WS_RATE_LIMIT_PER_MIN;
  }

  forget(socketId) {
    this.buckets.delete(socketId);
  }

  /**
   * Validate the shape of an inbound signaling message.
   * Returns null if valid, or a short string identifying the problem.
   */
  validate(msg) {
    if (!msg || typeof msg !== 'object') return 'malformed';
    if (typeof msg.type !== 'string') return 'missing-type';

    const allowed = new Set([
      'create-session',
      'join-session',
      'signal',
      'stream-state',
      'leave-session',
      'ping',
    ]);
    if (!allowed.has(msg.type)) return 'unknown-type';

    if (msg.type === 'create-session') {
      // The server generates the code; the client must not supply one.
      if (msg.role !== 'controller') return 'invalid-role';
    }

    if (msg.type === 'join-session') {
      if (typeof msg.code !== 'string' || !config.SESSION_CODE_REGEX.test(msg.code)) {
        return 'invalid-code';
      }
      if (msg.role !== 'viewer') return 'invalid-role';
    }

    if (msg.type === 'signal') {
      const p = msg.payload;
      if (!p || typeof p !== 'object') return 'invalid-payload';
      if (p.type === 'offer' || p.type === 'answer') {
        if (typeof p.sdp !== 'string' || p.sdp.length > 200_000) return 'invalid-sdp';
      } else if (p.type === 'ice') {
        if (!p.candidate || typeof p.candidate !== 'object') return 'invalid-ice';
      } else {
        return 'unknown-signal';
      }
    }

    if (msg.type === 'stream-state') {
      if (typeof msg.active !== 'boolean') return 'invalid-stream-state';
    }

    return null;
  }
}

module.exports = new SignalingService();
