'use strict';

const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const sessions = require('../services/sessionService');
const signaling = require('../services/signalingService');
const config = require('../config');

/**
 * WebSocket signaling layer.
 *
 * Message contract (client → server):
 *   { type: "create-session", code, role: "controller" }
 *   { type: "join-session",   code, role: "viewer" }
 *   { type: "signal",         payload: { type: "offer"|"answer"|"ice", ... } }
 *   { type: "stream-state",   active, output }
 *   { type: "leave-session" }
 *   { type: "ping" }
 *
 * Server → client:
 *   { type: "session-created", code }
 *   { type: "session-joined",  code }
 *   { type: "peer-joined" }
 *   { type: "signal",          payload }
 *   { type: "stream-state",    active, output }
 *   { type: "peer-left" }
 *   { type: "error",           message }
 *   { type: "pong" }
 */

/** @type {import('ws').WebSocketServer | null} */
let wssRef = null;

function initSignaling(server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: config.MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
    verifyClient: (info, done) => {
      // Origin check when configured.
      const origin = info.origin || (info.req && info.req.headers && info.req.headers.origin);
      if (config.ALLOWED_ORIGINS.length > 0 && origin) {
        if (!config.ALLOWED_ORIGINS.includes(origin)) {
          return done(false, 403, 'Origin not allowed');
        }
      }
      return done(true);
    },
  });

  wssRef = wss;

  wss.on('connection', (ws, req) => {
    ws.id = crypto.randomUUID();
    ws.sessionCode = null;
    ws.role = null;
    ws.isAlive = true;
    ws.wss = wss; // attach for scoped lookup

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      if (!signaling.allow(ws.id)) {
        safeSend(ws, { type: 'error', message: 'Rate limit exceeded. Slow down.' });
        return;
      }

      let msg;
      try {
        msg = JSON.parse(raw.toString('utf8'));
      } catch {
        safeSend(ws, { type: 'error', message: 'Malformed JSON.' });
        return;
      }

      const invalid = signaling.validate(msg);
      if (invalid) {
        safeSend(ws, { type: 'error', message: `Invalid message: ${invalid}` });
        return;
      }

      try {
        handleMessage(ws, msg);
      } catch (err) {
        console.error('[ws] handler error:', err.message);
        safeSend(ws, { type: 'error', message: 'Server error handling message.' });
      }
    });

    ws.on('close', () => {
      signaling.forget(ws.id);

      const codeAtClose = ws.sessionCode;
      const roleAtClose = ws.role;

      const affected = sessions.detach(ws.id);

      for (const code of affected) {
        const s = sessions.get(code);
        if (!s) continue;

        // Notify the surviving peer.
        const survivor = roleAtClose === 'controller' ? s.viewer : s.controller;
        if (survivor) {
          const peer = findSocket(survivor.socketId);
          if (peer) safeSend(peer, { type: 'peer-left' });
        }

        // Clean up fully abandoned sessions.
        if (!s.controller && !s.viewer) sessions.destroy(code);
      }

      // Clear socket-scoped state.
      ws.sessionCode = codeAtClose;
      ws.role = roleAtClose;
    });

    ws.on('error', (err) => {
      console.warn('[ws] socket error:', err && err.message);
    });
  });

  // Heartbeat — drop dead sockets.
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    });
  }, 30_000);
  if (heartbeat.unref) heartbeat.unref();

  wss.on('close', () => {
    clearInterval(heartbeat);
    if (wssRef === wss) wssRef = null;
  });

  return wss;
}

/* ------------------------------------------------------------------ */
/* Message handlers                                                    */
/* ------------------------------------------------------------------ */

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'create-session':
      return onCreateSession(ws);
    case 'join-session':
      return onJoinSession(ws, msg);
    case 'signal':
      return onSignal(ws, msg);
    case 'stream-state':
      return onStreamState(ws, msg);
    case 'leave-session':
      return onLeaveSession(ws);
    case 'ping':
      return safeSend(ws, { type: 'pong' });
    default:
      return;
  }
}

function onCreateSession(ws) {
  // Controller creates a session. Server assigns the code so it stays
  // unpredictable; client-supplied codes are rejected for creation.
  if (ws.sessionCode) {
    return safeSend(ws, { type: 'error', message: 'Already in a session.' });
  }

  let session;
  try {
    session = sessions.create();
  } catch (err) {
    return safeSend(ws, { type: 'error', message: err.message || 'Could not create session.' });
  }

  const attach = sessions.attachController(session.code, ws.id, { role: 'controller' });
  if (!attach.ok) {
    sessions.destroy(session.code);
    return safeSend(ws, { type: 'error', message: 'Could not register controller.' });
  }

  ws.sessionCode = session.code;
  ws.role = 'controller';

  safeSend(ws, { type: 'session-created', code: session.code });
}

function onJoinSession(ws, msg) {
  if (ws.sessionCode) {
    return safeSend(ws, { type: 'error', message: 'Already in a session.' });
  }

  const code = String(msg.code || '').toUpperCase();
  if (!config.SESSION_CODE_REGEX.test(code)) {
    return safeSend(ws, { type: 'error', message: 'Invalid session code format.' });
  }

  const session = sessions.get(code);
  if (!session) {
    return safeSend(ws, { type: 'error', message: 'Session not found or expired.' });
  }

  const attach = sessions.attachViewer(code, ws.id, { role: 'viewer' });
  if (!attach.ok) {
    const message =
      attach.reason === 'no-controller'
        ? 'Controller has not connected yet.'
        : attach.reason === 'viewer-exists'
        ? 'Session already has a viewer.'
        : 'Unable to join session.';
    return safeSend(ws, { type: 'error', message });
  }

  ws.sessionCode = code;
  ws.role = 'viewer';

  safeSend(ws, { type: 'session-joined', code });

  // Notify the controller that a viewer joined.
  if (session.controller) {
    const controller = findSocket(session.controller.socketId);
    if (controller) safeSend(controller, { type: 'peer-joined' });
  }

  // Send the current stream state (if the controller is already streaming).
  if (session.streamState && session.streamState.active) {
    safeSend(ws, {
      type: 'stream-state',
      active: true,
      output: session.streamState.output,
    });
  }
}

function onSignal(ws, msg) {
  if (!ws.sessionCode) {
    return safeSend(ws, { type: 'error', message: 'Not in a session.' });
  }

  const session = sessions.get(ws.sessionCode);
  if (!session) {
    return safeSend(ws, { type: 'error', message: 'Session expired.' });
  }

  const peerInfo = ws.role === 'controller' ? session.viewer : session.controller;
  if (!peerInfo) return; // silently drop; peer not present

  const peer = findSocket(peerInfo.socketId);
  if (peer) safeSend(peer, { type: 'signal', payload: msg.payload });
}

function onStreamState(ws, msg) {
  if (!ws.sessionCode) return;

  const session = sessions.get(ws.sessionCode);
  if (!session) return;
  if (ws.role !== 'controller') return; // only controller may change stream state

  const output =
    msg.output && typeof msg.output === 'object'
      ? {
          resolution: Number(msg.output.resolution) || 1080,
          fps: Number(msg.output.fps) || 30,
          quality:
            typeof msg.output.quality === 'string'
              ? msg.output.quality.slice(0, 12)
              : 'High',
        }
      : null;

  session.streamState = { active: !!msg.active, output };

  const viewerInfo = session.viewer;
  if (viewerInfo) {
    const peer = findSocket(viewerInfo.socketId);
    if (peer) safeSend(peer, { type: 'stream-state', active: !!msg.active, output });
  }
}

function onLeaveSession(ws) {
  const code = ws.sessionCode;
  if (!code) return;

  const prevRole = ws.role;

  const affected = sessions.detach(ws.id);
  ws.sessionCode = null;
  ws.role = null;

  for (const c of affected) {
    const s = sessions.get(c);
    if (!s) continue;

    const survivor = prevRole === 'controller' ? s.viewer : s.controller;
    if (survivor) {
      const peer = findSocket(survivor.socketId);
      if (peer) safeSend(peer, { type: 'peer-left' });
    }

    if (!s.controller && !s.viewer) sessions.destroy(c);
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Find a connected socket by its server-assigned id.
 * Uses the module-scoped wssRef so it works regardless of caller context.
 */
function findSocket(socketId) {
  if (!wssRef) return null;
  for (const client of wssRef.clients) {
    if (client.id === socketId && client.readyState === client.OPEN) return client;
  }
  return null;
}

function safeSend(ws, obj) {
  if (!ws || ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

module.exports = { initSignaling };