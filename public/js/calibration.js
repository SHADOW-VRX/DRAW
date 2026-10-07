'use strict';
(function () {
  const { State, UI } = DRAW;

  const Calibration = {
    dragging: -1,

    point(e) {
      const rect = DRAW.AR.canvas.getBoundingClientRect();
      const ratio = DRAW.AR.canvas.width / DRAW.AR.canvas.height;
      let width = rect.width;
      let height = width / ratio;
      if (height > rect.height) {
        height = rect.height;
        width = height * ratio;
      }
      return [
        (e.clientX - rect.left - (rect.width - width) / 2) / width,
        (e.clientY - rect.top - (rect.height - height) / 2) / height,
      ];
    },

    valid(points) {
      let sign = 0;
      for (let i = 0; i < 4; i++) {
        const a = points[i];
        const b = points[(i + 1) % 4];
        const c = points[(i + 2) % 4];
        const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(cross) < 0.002) return false;
        if (i === 0) sign = Math.sign(cross);
        else if (Math.sign(cross) !== sign) return false;
      }
      return sign > 0;
    },

    init() {
      DRAW.AR.canvas.addEventListener('pointerdown', (e) => {
        if (!State.calibrating || State.locked) return;
        const p = this.point(e);
        let dist = 0.07;
        State.corners.forEach((corner, i) => {
          const d = Math.hypot(corner[0] - p[0], corner[1] - p[1]);
          if (d < dist) {
            dist = d;
            this.dragging = i;
          }
        });
        if (this.dragging >= 0) {
          DRAW.AR.canvas.setPointerCapture(e.pointerId);
          e.preventDefault();
        }
      });
      DRAW.AR.canvas.addEventListener('pointermove', (e) => {
        if (this.dragging < 0) return;
        const p = this.point(e).map((v) => Math.max(0.035, Math.min(0.965, v)));
        const next = State.corners.map((c) => c.slice());
        next[this.dragging] = p;
        if (this.valid(next)) State.corners = next;
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        DRAW.AR.canvas.addEventListener(ev, () => (this.dragging = -1));
      }
    },

    calibrate() {
      if (State.calibrating && !State.locked) {
        State.corners = [[0.19, 0.22], [0.81, 0.22], [0.81, 0.78], [0.19, 0.78]];
      }
      State.locked = false;
      State.calibrating = true;
      UI.update();
      UI.toast(
        State.cameraReady
          ? 'Drag the four handles to your wall corners.'
          : 'Calibrating the demo wall. Enable your camera for a real mural.'
      );
    },

    lock() {
      if (State.locked) {
        State.locked = false;
        State.calibrating = true;
      } else {
        State.locked = true;
        State.calibrating = false;
        UI.toast('Wall locked. Keep the camera in this exact position.');
      }
      UI.update();
    },
  };

  DRAW.Calibration = Calibration;
})();