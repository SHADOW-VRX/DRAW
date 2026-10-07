'use strict';
(function () {
  const { $, State, UI } = DRAW;

  const Camera = {
    facing: 'environment',

    async start(switchFacing = false) {
      if (!navigator.mediaDevices?.getUserMedia) {
        UI.toast('Camera access needs HTTPS or localhost and a compatible browser.');
        return;
      }
      const request = ++State.cameraRequest;
      if (switchFacing) {
        this.facing = this.facing === 'environment' ? 'user' : 'environment';
      }
      this.stop(false);
      $('enableCamera').disabled = true;
      $('enableCamera').textContent = 'Opening…';
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: this.facing },
            width: { ideal: Math.round(State.resolution * 16 / 9) },
            height: { ideal: State.resolution },
            frameRate: { ideal: State.fps },
          },
        });
        if (request !== State.cameraRequest) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        State.camera = stream;
        $('cameraVideo').srcObject = stream;
        await $('cameraVideo').play();
        State.cameraReady = true;
        stream.getVideoTracks()[0].addEventListener('ended', () => {
          State.cameraReady = false;
          if (State.live) DRAW.Streaming.stop();
          UI.update();
          UI.toast('Camera disconnected. Enable it again to continue.');
        });
        UI.toast('Camera ready. Set your wall corners to begin.');
      } catch (e) {
        State.cameraReady = false;
        UI.toast(
          e.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow access in your browser settings.'
            : e.name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : 'Unable to open the camera: ' + e.message
        );
      } finally {
        $('enableCamera').disabled = false;
        UI.update();
      }
    },

    stop(invalidate = true) {
      if (invalidate) State.cameraRequest++;
      if (State.camera) State.camera.getTracks().forEach((t) => t.stop());
      State.camera = null;
      State.cameraReady = false;
      $('cameraVideo').srcObject = null;
    },

    async apply() {
      if (!State.camera) return;
      try {
        await State.camera.getVideoTracks()[0].applyConstraints({
          width: { ideal: Math.round(State.resolution * 16 / 9) },
          height: { ideal: State.resolution },
          frameRate: { ideal: State.fps },
        });
      } catch {
        UI.toast('Camera cannot match this preset. Canvas output will use the selected size.');
      }
    },
  };

  DRAW.Camera = Camera;
})();