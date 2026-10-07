'use strict';
(function () {
  const { $, State } = DRAW;

  const AR = {
    canvas: null,
    ctx: null,
    last: 0,

    init() {
      this.canvas = $('outputCanvas');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.resize();
      const loop = (t) => {
        requestAnimationFrame(loop);
        if (t - this.last < 1000 / State.fps) return;
        this.last = t;
        if (State.role === 'controller') this.render();
      };
      requestAnimationFrame(loop);
    },

    resize() {
      this.canvas.width = Math.round(State.resolution * 16 / 9);
      this.canvas.height = State.resolution;
      $('canvasResolution').textContent = `${this.canvas.width} × ${this.canvas.height}`;
    },

    homography(p) {
      const source = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const m = [];
      for (let i = 0; i < 4; i++) {
        const [u, v] = source[i];
        const [x, y] = p[i];
        m.push(
          [u, v, 1, 0, 0, 0, -u * x, -v * x, x],
          [0, 0, 0, u, v, 1, -u * y, -v * y, y]
        );
      }
      for (let i = 0; i < 8; i++) {
        let k = i;
        for (let j = i + 1; j < 8; j++) {
          if (Math.abs(m[j][i]) > Math.abs(m[k][i])) k = j;
        }
        [m[i], m[k]] = [m[k], m[i]];
        const d = m[i][i];
        if (Math.abs(d) < 1e-8) return null;
        for (let j = i; j < 9; j++) m[i][j] /= d;
        for (let r = 0; r < 8; r++) {
          if (r !== i) {
            const f = m[r][i];
            for (let j = i; j < 9; j++) m[r][j] -= f * m[i][j];
          }
        }
      }
      const h = m.map((r) => r[8]);
      return (u, v) => {
        const d = h[6] * u + h[7] * v + 1;
        return [(h[0] * u + h[1] * v + h[2]) / d, (h[3] * u + h[4] * v + h[5]) / d];
      };
    },

    triangle(img, s, d) {
      const c = this.ctx;
      const [s0, s1, s2] = s;
      const [d0, d1, d2] = d;
      const det = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
      if (Math.abs(det) < 0.001) return;
      const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / det;
      const b = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / det;
      const cc = ((s1[0] - s0[0]) * (d2[0] - d0[0]) - (s2[0] - s0[0]) * (d1[0] - d0[0])) / det;
      const dd = ((s1[0] - s0[0]) * (d2[1] - d0[1]) - (s2[0] - s0[0]) * (d1[1] - d0[1])) / det;
      c.save();
      c.beginPath();
      c.moveTo(...d0);
      c.lineTo(...d1);
      c.lineTo(...d2);
      c.closePath();
      c.clip();
      c.transform(a, b, cc, dd, d0[0] - a * s0[0] - cc * s0[1], d0[1] - b * s0[0] - dd * s0[1]);
      c.drawImage(img, 0, 0);
      c.restore();
    },

    demo(w, h) {
      const c = this.ctx;
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#b7b8a4');
      g.addColorStop(0.55, '#d1cdb7');
      g.addColorStop(1, '#b0ac95');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#8f9280';
      c.fillRect(0, h * 0.89, w, h * 0.11);
      const f = c.createLinearGradient(0, h * 0.89, 0, h);
      f.addColorStop(0, '#9b9d88');
      f.addColorStop(1, '#737e6c');
      c.fillStyle = f;
      c.fillRect(0, h * 0.895, w, h * 0.105);
      c.strokeStyle = '#696f5b66';
      c.lineWidth = h * 0.004;
      c.beginPath(); c.moveTo(0, h * 0.89); c.lineTo(w, h * 0.89); c.stroke();
      c.fillStyle = '#57634b';
      c.fillRect(0, 0, w * 0.028, h * 0.89);
      c.fillStyle = '#939982';
      c.fillRect(w * 0.028, 0, w * 0.025, h * 0.89);
      c.strokeStyle = '#868d7460';
      c.lineWidth = 1;
      for (let i = 1; i < 9; i++) {
        c.beginPath();
        c.moveTo((w * i) / 9, h * 0.9);
        c.lineTo(w * (i / 9 - 0.07), h);
        c.stroke();
      }
      const shade = c.createLinearGradient(0, 0, w * 0.33, 0);
      shade.addColorStop(0, '#303d3540');
      shade.addColorStop(1, '#303d3500');
      c.fillStyle = shade;
      c.fillRect(0, 0, w * 0.33, h * 0.89);
      c.fillStyle = '#a6ad9588';
      c.beginPath();
      c.moveTo(w * 0.78, 0); c.lineTo(w, 0); c.lineTo(w, h * 0.42);
      c.lineTo(w * 0.66, h * 0.89); c.lineTo(w * 0.52, h * 0.89);
      c.closePath(); c.fill();
      c.fillStyle = '#616f5866';
      c.fillRect(w * 0.897, h * 0.72, w * 0.065, h * 0.17);
      c.fillStyle = '#5e705a';
      for (let i = 0; i < 7; i++) {
        c.beginPath();
        c.ellipse(w * (0.93 + 0.018 * Math.sin(i * 2)), h * (0.6 + i * 0.016),
          w * 0.012, h * 0.065, (i - 3) * 0.27, 0, Math.PI * 2);
        c.fill();
      }
      c.font = `${h * 0.016}px "DM Sans",sans-serif`;
      c.fillStyle = '#f0f1e7';
      c.fillText('DEMO WALL · NOT A CAMERA FEED', w * 0.028, h * 0.964);
    },

    line(a, b, color, width, dash = []) {
      const c = this.ctx;
      c.strokeStyle = color;
      c.lineWidth = width;
      c.setLineDash(dash);
      c.beginPath();
      c.moveTo(...a);
      c.lineTo(...b);
      c.stroke();
      c.setLineDash([]);
    },

    label(text, x, y, size) {
      const c = this.ctx;
      c.font = `500 ${size}px "DM Sans",sans-serif`;
      const width = c.measureText(text).width;
      c.fillStyle = '#17251dd9';
      c.beginPath();
      c.roundRect(x - width / 2 - size * 0.65, y - size * 0.7, width + size * 1.3, size * 1.65, size * 0.28);
      c.fill();
      c.fillStyle = '#e8efd8';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, x, y + size * 0.1);
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
    },

    render() {
      const c = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const unit = h / 1080;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1;

      if (State.cameraReady && $('cameraVideo').readyState >= 2) {
        const v = $('cameraVideo');
        const scale = Math.max(w / v.videoWidth, h / v.videoHeight);
        c.drawImage(
          v,
          (w - v.videoWidth * scale) / 2,
          (h - v.videoHeight * scale) / 2,
          v.videoWidth * scale,
          v.videoHeight * scale
        );
      } else {
        this.demo(w, h);
      }

      const p = State.corners.map(([x, y]) => [x * w, y * h]);
      const project = this.homography(p);
      if (!project) return;

      DRAW.Artwork.rebuild();
      if (State.art && State.opacity > 0) {
        c.globalAlpha = State.opacity;
        const n = State.resolution >= 1440 ? 18 : 12;
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            const u = x / n, v = y / n, u2 = (x + 1) / n, v2 = (y + 1) / n;
            const a = [u * 1200, v * 800];
            const b = [u2 * 1200, v * 800];
            const d = [u * 1200, v2 * 800];
            const e = [u2 * 1200, v2 * 800];
            const A = project(u, v), B = project(u2, v), D = project(u, v2), E = project(u2, v2);
            this.triangle(DRAW.Artwork.texture, [a, b, e], [A, B, E]);
            this.triangle(DRAW.Artwork.texture, [a, e, d], [A, E, D]);
          }
        }
        c.globalAlpha = 1;
      }

      const lineWidth = Math.max(1, 1.3 * unit);
      if (State.grid) {
        const cols = State.divisions;
        const rows = Math.max(2, Math.round((cols * State.height) / State.width));
        for (let i = 1; i < cols; i++) {
          this.line(project(i / cols, 0), project(i / cols, 1), '#eff5d87d', lineWidth, [6 * unit, 6 * unit]);
        }
        for (let i = 1; i < Math.min(60, rows); i++) {
          this.line(project(0, i / rows), project(1, i / rows), '#eff5d87d', lineWidth, [6 * unit, 6 * unit]);
        }
      }
      for (let i = 0; i < 4; i++) {
        this.line(p[i], p[(i + 1) % 4], '#e2f2cbba', 1.5 * unit);
      }
      if (State.guides) {
        this.line(project(0.5, 0), project(0.5, 1), '#d7f69ccd', 2 * unit);
        this.line(project(0, 0.5), project(1, 0.5), '#d7f69ccd', 2 * unit);
        const center = project(0.5, 0.5);
        c.strokeStyle = '#d7f69c';
        c.lineWidth = 2 * unit;
        c.beginPath();
        c.arc(...center, 14 * unit, 0, Math.PI * 2);
        c.stroke();
      }
      if (State.measure) {
        const top = project(0.5, 0);
        const side = project(1, 0.5);
        this.label(`${State.width.toFixed(1)} ${State.units}`, top[0], top[1] - 25 * unit, 17 * unit);
        this.label(`${State.height.toFixed(1)} ${State.units}`, side[0] + 43 * unit, side[1], 17 * unit);
        if (State.grid) {
          const cell = project(0.5, 1);
          this.label(`${(State.width / State.divisions).toFixed(2)} ${State.units} / cell`, cell[0], cell[1] + 27 * unit, 13 * unit);
        }
      }
      for (let i = 0; i < 4; i++) {
        const [x, y] = p[i];
        const r = (State.calibrating ? 14 : 6) * unit;
        c.fillStyle = State.calibrating ? '#d7f69c' : '#ecf8d8';
        c.strokeStyle = '#1c2a1b';
        c.lineWidth = 2 * unit;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        if (State.calibrating) {
          c.font = `600 ${13 * unit}px sans-serif`;
          c.fillStyle = '#22331d';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(String(i + 1), x, y);
          c.textAlign = 'left';
          c.textBaseline = 'alphabetic';
        }
      }
    },
  };

  DRAW.AR = AR;
})();