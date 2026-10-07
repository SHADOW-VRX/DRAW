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