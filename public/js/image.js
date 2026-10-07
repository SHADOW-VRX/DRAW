'use strict';
(function () {
  const { $, State, UI } = DRAW;

  const Artwork = {
    base: document.createElement('canvas'),
    texture: document.createElement('canvas'),
    dirty: true,
    outline: null,

    init() {
      this.base.width = 1200;
      this.base.height = 800;
      const c = this.base.getContext('2d');
      c.fillStyle = '#eee2c9';
      c.fillRect(0, 0, 1200, 800);
      c.fillStyle = '#d56741';
      c.beginPath();
      c.moveTo(0, 0); c.lineTo(470, 0);
      c.bezierCurveTo(430, 160, 560, 270, 425, 400);
      c.bezierCurveTo(295, 525, 375, 670, 305, 800);
      c.lineTo(0, 800); c.closePath(); c.fill();
      c.fillStyle = '#284f49';
      c.beginPath();
      c.moveTo(610, 800);
      c.bezierCurveTo(615, 640, 445, 615, 470, 485);
      c.bezierCurveTo(505, 320, 755, 435, 815, 255);
      c.bezierCurveTo(850, 155, 800, 70, 855, 0);
      c.lineTo(1200, 0); c.lineTo(1200, 800); c.closePath(); c.fill();
      c.fillStyle = '#d4a956';
      c.beginPath(); c.arc(647, 225, 115, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#9eaf91';
      c.beginPath();
      c.moveTo(760, 800);
      c.bezierCurveTo(760, 650, 655, 585, 697, 494);
      c.bezierCurveTo(741, 400, 924, 487, 999, 328);
      c.bezierCurveTo(1040, 240, 989, 128, 1080, 85);
      c.lineTo(1200, 55); c.lineTo(1200, 800); c.closePath(); c.fill();
      c.strokeStyle = '#eee2c9';
      c.lineWidth = 7;
      c.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(69 + i * 29, 705);
        c.bezierCurveTo(232 + i * 20, 598, 117 + i * 32, 427, 270 + i * 27, 344);
        c.stroke();
      }
      c.fillStyle = '#c4794e';
      c.beginPath();
      c.ellipse(538, 708, 89, 42, -0.3, 0, Math.PI * 2);
      c.fill();
      State.art = this.base;
      this.texture.width = 1200;
      this.texture.height = 800;
      $('artThumb').src = this.base.toDataURL();
      this.dirty = true;
    },

    /** Restore artwork from localStorage, if present. Called on boot. */
    async restore() {
      const url = DRAW.Persist.loadArtwork();
      if (!url) return false;
      try {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });
        if (!img.naturalWidth) throw new Error('bad image');
        State.art = img;
        this.outline = null;
        this.dirty = true;
        $('artThumb').src = url;
        $('artName').textContent = State.artName || 'Restored artwork';
        $('artMeta').textContent = `${img.naturalWidth} × ${img.naturalHeight} · Restored`;
        return true;
      } catch (err) {
        console.warn('[artwork] restore failed:', err && err.message);
        DRAW.Persist.clearArtwork();
        return false;
      }
    },

    rebuild() {
      if (!this.dirty) return;
      this.dirty = false;
      const c = this.texture.getContext('2d');
      c.clearRect(0, 0, 1200, 800);
      if (!State.art) return;
      c.save();
      c.translate(600 + State.x * 600, 400 + State.y * 400);
      c.rotate((State.rotation * Math.PI) / 180);
      c.scale(State.zoom * (State.flipX ? -1 : 1), State.zoom * (State.flipY ? -1 : 1));
      const source = State.ghost ? this.getOutline() : State.art;
      const w = source.naturalWidth || source.width;
      const h = source.naturalHeight || source.height;
      const scale = Math.min(1200 / w, 800 / h);
      c.drawImage(source, (-w * scale) / 2, (-h * scale) / 2, w * scale, h * scale);
      c.restore();
    },

    getOutline() {
      if (this.outline) return this.outline;
      const src = State.art;
      const w = src.naturalWidth || src.width;
      const h = src.naturalHeight || src.height;
      const cv = document.createElement('canvas');
      cv.width = 600;
      cv.height = Math.round((600 * h) / w);
      const c = cv.getContext('2d', { willReadFrequently: true });
      c.drawImage(src, 0, 0, cv.width, cv.height);
      const im = c.getImageData(0, 0, cv.width, cv.height);
      const out = c.createImageData(cv.width, cv.height);
      const d = im.data;
      const gray = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      for (let y = 1; y < cv.height - 1; y++) {
        for (let x = 1; x < cv.width - 1; x++) {
          const i = (y * cv.width + x) * 4;
          const dx = gray(i + 4) - gray(i - 4);
          const dy = gray(i + cv.width * 4) - gray(i - cv.width * 4);
          const edge = Math.min(255, Math.hypot(dx, dy) * 3);
          out.data[i] = 225;
          out.data[i + 1] = 250;
          out.data[i + 2] = 190;
          out.data[i + 3] = edge > 35 ? edge : 0;
        }
      }
      c.putImageData(out, 0, 0);
      this.outline = cv;
      return cv;
    },

    async upload(file) {
      if (!file) return;
      if (file.size > 30 * 1024 * 1024) {
        UI.toast('Please choose an image smaller than 30 MB.');
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      try {
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });
        if (!img.naturalWidth) throw new Error();
        State.art = img;
        State.artName = file.name;
        this.outline = null;
        this.dirty = true;
        $('artThumb').src = url;
        $('artName').textContent = file.name;
        $('artMeta').textContent = `${img.naturalWidth} × ${img.naturalHeight} · Local file`;
        $('projectName').textContent = file.name.replace(/\.[^.]+$/, '').toUpperCase();

        // Persist artwork as a data URL so a refresh restores it.
        this.persistArtwork().then((ok) => {
          if (ok === false) {
            UI.toast('Artwork loaded but too large to persist across refresh.');
          } else {
            UI.toast('Artwork loaded. Your image stays on this device.');
          }
        });
      } catch {
        URL.revokeObjectURL(url);
        UI.toast('This image could not be opened. Try PNG, JPEG or WebP.');
      }
    },

    /** Convert the current source to a data URL and persist it. */
    async persistArtwork() {
      const src = State.art;
      if (!src) {
        DRAW.Persist.clearArtwork();
        return true;
      }
      try {
        // Re-encode to keep the payload small. Cap at 1400 px on the
        // long edge so phones don't blow the localStorage quota.
        const maxEdge = 1400;
        const w0 = src.naturalWidth || src.width;
        const h0 = src.naturalHeight || src.height;
        const ratio = Math.min(1, maxEdge / Math.max(w0, h0));
        const w = Math.round(w0 * ratio);
        const h = Math.round(h0 * ratio);
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        const c = cv.getContext('2d');
        c.drawImage(src, 0, 0, w, h);
        const url = cv.toDataURL('image/jpeg', 0.85);
        const ok = DRAW.Persist.saveArtwork(url);
        if (!ok) return false;
        // Persist the name alongside the state snapshot.
        DRAW.State.artName = State.artName;
        DRAW.Persist.save();
        return true;
      } catch (err) {
        console.warn('[artwork] persist failed:', err);
        return false;
      }
    },

    clear() {
      State.art = null;
      this.outline = null;
      this.dirty = true;
      DRAW.Persist.clearArtwork();
      $('artName').textContent = 'No artwork selected';
      $('artMeta').textContent = 'Upload an image to begin';
      $('artThumb').removeAttribute('src');
    },
  };

  DRAW.Artwork = Artwork;
})();
