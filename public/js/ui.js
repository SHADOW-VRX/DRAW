'use strict';
(function () {
  const { $, State } = DRAW;

  const UI = {
    toastTimer: null,

    toast(message) {
      const el = $('toast');
      el.textContent = message;
      el.classList.add('show');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
    },

    summary() {
      return `${State.resolution}p · ${State.fps} FPS · ${State.quality}`;
    },

    update() {
      const summary = this.summary();
      $('outputSummary').textContent = summary;
      $('qualityCheck').textContent = summary;
      $('dimensionBadge').textContent =
        `${State.width.toFixed(1)} × ${State.height.toFixed(1)} ${State.units}`;
      $('cameraFooter').textContent = State.cameraReady ? 'Camera ready' : 'Camera not enabled';
      $('cameraDot').classList.toggle('green', State.cameraReady);
      $('cameraCheck').classList.toggle('ready', State.cameraReady);
      $('cameraCheck').innerHTML =
        `<svg><use href="#${State.cameraReady ? 'i-check' : 'i-camera'}"/></svg>${State.cameraReady ? 'Camera Ready ✓' : 'Camera not ready'}`;
      $('peerCheck').classList.toggle('ready', State.connected);
      $('peerCheck').innerHTML =
        `<svg><use href="#${State.connected ? 'i-check' : 'i-eye'}"/></svg>${State.connected ? 'Device B Connected ✓' : State.paired ? 'Device B paired' : 'Viewer not paired'}`;
      $('startLive').disabled =
        !State.live && (!State.cameraReady || !State.paired || !State.ws || State.ws.readyState !== 1);
      $('startLive').innerHTML =
        `<svg><use href="#${State.live ? 'i-stop' : 'i-play'}"/></svg><span>${State.live ? 'STOP LIVE VIEW' : 'START LIVE VIEW'}</span>`;
      $('previewBadge').classList.toggle('on', State.cameraReady);
      $('previewBadge').innerHTML =
        `<span class="dot ${State.cameraReady ? 'green' : ''}"></span>${State.live ? 'LIVE' : State.cameraReady ? 'CAMERA' : 'PREVIEW'}`;
      $('enableCamera').textContent = State.cameraReady ? 'Switch camera' : 'Enable camera';
      $('calibrationBadge').innerHTML =
        `<svg><use href="#${State.locked ? 'i-lock' : 'i-target'}"/></svg>${State.locked ? 'Wall locked' : State.calibrating ? 'Drag corners to your wall' : 'Ready to calibrate'}`;
      $('calibrationStep').textContent =
        State.locked ? 'LOCKED' : State.calibrating ? 'ALIGNING' : '4 POINTS';
      $('lockButton').disabled = !State.calibrating && !State.locked;
      $('lockButton').innerHTML =
        `<svg><use href="#${State.locked ? 'i-unlock' : 'i-lock'}"/></svg>${State.locked ? 'Unlock' : 'Lock wall'}`;
      $('calibrateButton').innerHTML =
        `<svg><use href="#i-target"/></svg>${State.locked ? 'Recalibrate' : State.calibrating ? 'Reset corners' : 'Calibrate'}`;
      $('calibrationNote').textContent = State.locked
        ? 'Corners locked. Keep your camera stationary; moving it requires recalibration.'
        : 'Align the four corners with your wall, then lock your canvas in place.';
      $('canvasHint').textContent = State.calibrating
        ? 'Drag the four corner handles'
        : State.locked
        ? 'Wall calibrated · Keep camera steady'
        : '4-point perspective calibration';
      $('previewCallout').classList.toggle('hidden', State.cameraReady && !State.calibrating);
      $('previewCallout').querySelector('span').textContent = State.calibrating
        ? 'Drag each corner to match your wall'
        : State.cameraReady
        ? 'Camera is ready'
        : 'Demo wall · Enable your camera to get started';
      $('gridTool').classList.toggle('active', State.grid);
      $('gridTool').setAttribute('aria-pressed', State.grid);
      $('guidesTool').classList.toggle('active', State.guides);
      $('guidesTool').setAttribute('aria-pressed', State.guides);
      for (const [id, key] of [['gridSwitch', 'grid'], ['guideSwitch', 'guides'], ['measureSwitch', 'measure'], ['ghostSwitch', 'ghost']]) {
        $(id).setAttribute('aria-checked', State[key]);
      }
      $('sessionButtonText').textContent = State.code ? 'Session ' + State.code : 'Create session';
    },

    role(role) {
      if (State.live || State.paired || State.code) {
        this.toast('Leave your current session before switching devices.');
        return;
      }
      State.role = role;
      $('controllerApp').classList.toggle('hidden', role !== 'controller');
      $('viewerApp').classList.toggle('hidden', role !== 'viewer');
      for (const [id, r] of [['controllerTab', 'controller'], ['viewerTab', 'viewer']]) {
        $(id).classList.toggle('active', role === r);
        $(id).setAttribute('aria-pressed', role === r);
      }
      if (role === 'viewer') {
        DRAW.Camera.stop();
      }
    },
  };

  DRAW.UI = UI;
})();