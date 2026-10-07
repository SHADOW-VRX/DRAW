'use strict';
/* Global application state — single source of truth. */
window.DRAW = window.DRAW || {};

DRAW.State = {
  role: 'controller',
  camera: null,
  cameraReady: false,
  art: null,
  artName: 'Desert rhythm',
  opacity: 0.75,
  width: 3,
  height: 2,
  units: 'm',
  zoom: 1,
  rotation: 0,
  x: 0,
  y: 0,
  flipX: false,
  flipY: false,
  grid: true,
  divisions: 6,
  measure: true,
  guides: false,
  ghost: false,
  calibrating: false,
  locked: false,
  corners: [[0.19, 0.22], [0.81, 0.22], [0.81, 0.78], [0.19, 0.78]],
  resolution: 1080,
  fps: 30,
  quality: 'High',
  ws: null,
  code: '',
  paired: false,
  pc: null,
  live: false,
  connected: false,
  outputStream: null,
  pendingIce: [],
  cameraRequest: 0,
};

DRAW.$ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */
/* Persisted to localStorage:
 *   - artwork (data URL) — capped to avoid blowing the storage quota
 *   - artworkName
 *   - wall width/height/units
 *   - opacity
 *   - transform: zoom, rotation, x, y, flipX, flipY
 *   - grid, divisions, measure, guides, ghost
 *   - corners
 *   - locked (but not calibrating)
 *   - resolution, fps, quality
 *   - role
 *
 * NOT persisted (intentionally):
 *   - camera stream
 *   - WebSocket / session code / pairing
 *   - live streaming state
 */

DRAW.Persist = {
  KEY: 'draw-state-v1',
  ART_KEY: 'draw-art-v1',
  /** Roughly 4 MB of data URL is safe across most browsers. */
  MAX_ART_BYTES: 4 * 1024 * 1024,

  /** Fields of DRAW.State that should be persisted. */
  PERSISTED_FIELDS: [
    'role',
    'opacity',
    'width',
    'height',
    'units',
    'zoom',
    'rotation',
    'x',
    'y',
    'flipX',
    'flipY',
    'grid',
    'divisions',
    'measure',
    'guides',
    'ghost',
    'corners',
    'locked',
    'resolution',
    'fps',
    'quality',
  ],

  save() {
    try {
      const snap = {};
      for (const key of this.PERSISTED_FIELDS) {
        snap[key] = DRAW.State[key];
      }
      localStorage.setItem(this.KEY, JSON.stringify(snap));
    } catch (err) {
      // Quota or privacy mode — fail silently, app still works.
      console.warn('[persist] save failed:', err && err.message);
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return false;
      const snap = JSON.parse(raw);
      if (!snap || typeof snap !== 'object') return false;

      // Guard each field — reject obviously malformed values.
      const S = DRAW.State;
      if (typeof snap.role === 'string' && (snap.role === 'controller' || snap.role === 'viewer')) S.role = snap.role;
      if (Number.isFinite(snap.opacity)) S.opacity = clamp(snap.opacity, 0, 1);
      if (Number.isFinite(snap.width) && snap.width > 0 && snap.width <= 10000) S.width = snap.width;
      if (Number.isFinite(snap.height) && snap.height > 0 && snap.height <= 10000) S.height = snap.height;
      if (typeof snap.units === 'string' && ['m', 'cm', 'ft', 'in'].includes(snap.units)) S.units = snap.units;
      if (Number.isFinite(snap.zoom)) S.zoom = clamp(snap.zoom, 0.1, 2.5);
      if (Number.isFinite(snap.rotation)) S.rotation = clamp(snap.rotation, -180, 180);
      if (Number.isFinite(snap.x)) S.x = clamp(snap.x, -1, 1);
      if (Number.isFinite(snap.y)) S.y = clamp(snap.y, -1, 1);
      if (typeof snap.flipX === 'boolean') S.flipX = snap.flipX;
      if (typeof snap.flipY === 'boolean') S.flipY = snap.flipY;
      if (typeof snap.grid === 'boolean') S.grid = snap.grid;
      if (Number.isFinite(snap.divisions)) S.divisions = clamp(Math.round(snap.divisions), 2, 30);
      if (typeof snap.measure === 'boolean') S.measure = snap.measure;
      if (typeof snap.guides === 'boolean') S.guides = snap.guides;
      if (typeof snap.ghost === 'boolean') S.ghost = snap.ghost;
      if (Array.isArray(snap.corners) && snap.corners.length === 4 &&
          snap.corners.every((p) => Array.isArray(p) && p.length === 2 &&
            Number.isFinite(p[0]) && Number.isFinite(p[1]))) {
        S.corners = snap.corners.map(([a, b]) => [clamp(a, 0, 1), clamp(b, 0, 1)]);
      }
      if (typeof snap.locked === 'boolean') S.locked = snap.locked;
      if (Number.isFinite(snap.resolution) && [480, 720, 1080, 1440, 2160].includes(snap.resolution)) S.resolution = snap.resolution;
      if (Number.isFinite(snap.fps) && [24, 30, 60].includes(snap.fps)) S.fps = snap.fps;
      if (typeof snap.quality === 'string' && ['Low', 'Medium', 'High', 'Ultra'].includes(snap.quality)) S.quality = snap.quality;

      return true;
    } catch (err) {
      console.warn('[persist] load failed:', err && err.message);
      return false;
    }
  },

  /** Save artwork as a data URL. Rejects if too large. */
  saveArtwork(dataUrl) {
    try {
      if (!dataUrl) {
        localStorage.removeItem(this.ART_KEY);
        return true;
      }
      if (dataUrl.length > this.MAX_ART_BYTES) return false;
      localStorage.setItem(this.ART_KEY, dataUrl);
      return true;
    } catch (err) {
      console.warn('[persist] artwork save failed:', err && err.message);
      return false;
    }
  },

  loadArtwork() {
    try {
      return localStorage.getItem(this.ART_KEY) || null;
    } catch {
      return null;
    }
  },

  clearArtwork() {
    try { localStorage.removeItem(this.ART_KEY); } catch {}
  },

  clearAll() {
    try {
      localStorage.removeItem(this.KEY);
      localStorage.removeItem(this.ART_KEY);
    } catch {}
  },
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/* Auto-save on every meaningful change. Debounced to avoid hammering
 * localStorage during slider drags. */
(function installAutoSave() {
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => DRAW.Persist.save(), 250);
  };
  // Save on tab hide/unload as a backstop.
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') DRAW.Persist.save();
  });
  window.addEventListener('beforeunload', () => DRAW.Persist.save());
  // Expose the scheduler so other modules can trigger it.
  DRAW.Persist.schedule = schedule;
})();
