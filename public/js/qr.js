'use strict';
(function () {
  /* QR Model 2, version 1-L, alphanumeric, fixed mask 0.
     Native implementation: Reed–Solomon over GF(256). No external deps. */
  const QR = {
    draw(text, canvas) {
      const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
      if (text.length > 25 || [...text].some((c) => !alphabet.includes(c))) {
        throw new Error('Unsupported QR session code');
      }
      const bits = [];
      const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
      push(2, 4);
      push(text.length, 9);
      for (let i = 0; i < text.length; i += 2) {
        if (i + 1 < text.length) {
          push(alphabet.indexOf(text[i]) * 45 + alphabet.indexOf(text[i + 1]), 11);
        } else {
          push(alphabet.indexOf(text[i]), 6);
        }
      }
      for (let i = 0, n = Math.min(4, 152 - bits.length); i < n; i++) bits.push(0);
      while (bits.length % 8) bits.push(0);
      const data = [];
      for (let i = 0; i < bits.length; i += 8) {
        data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
      }
      for (let i = 0; data.length < 19; i++) data.push(i % 2 ? 0x11 : 0xec);

      const exp = new Array(512);
      const log = new Array(256);
      let v = 1;
      for (let i = 0; i < 255; i++) {
        exp[i] = v;
        log[v] = i;
        v <<= 1;
        if (v & 256) v ^= 0x11d;
      }
      for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
      const mul = (a, b) => (a && b ? exp[log[a] + log[b]] : 0);

      let gen = [1];
      for (let i = 0; i < 7; i++) {
        const next = new Array(gen.length + 1).fill(0);
        for (let j = 0; j < gen.length; j++) {
          next[j] ^= gen[j];
          next[j + 1] ^= mul(gen[j], exp[i]);
        }
        gen = next;
      }
      const remainder = [...data, ...new Array(7).fill(0)];
      for (let i = 0; i < 19; i++) {
        const f = remainder[i];
        for (let j = 0; j < gen.length; j++) remainder[i + j] ^= mul(gen[j], f);
      }
      const stream = [...data, ...remainder.slice(19)].flatMap((n) =>
        Array.from({ length: 8 }, (_, i) => (n >>> (7 - i)) & 1)
      );

      const n = 21;
      const m = Array.from({ length: n }, () => Array(n).fill(null));
      const set = (x, y, val) => { if (x >= 0 && x < n && y >= 0 && y < n) m[y][x] = val; };
      for (const [fx, fy] of [[0, 0], [14, 0], [0, 14]]) {
        for (let y = -1; y <= 7; y++) {
          for (let x = -1; x <= 7; x++) {
            const dark = x >= 0 && x <= 6 && y >= 0 && y <= 6 &&
              (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
            set(fx + x, fy + y, dark ? 1 : 0);
          }
        }
      }
      for (let i = 8; i < 13; i++) {
        set(i, 6, i % 2 === 0 ? 1 : 0);
        set(6, i, i % 2 === 0 ? 1 : 0);
      }
      const f1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
      const f2 = [
        ...Array.from({ length: 8 }, (_, i) => [20 - i, 8]),
        ...Array.from({ length: 7 }, (_, i) => [8, 14 + i]),
      ];
      f1.forEach((p) => set(...p, 0));
      f2.forEach((p) => set(...p, 0));
      set(8, 13, 1);

      let index = 0;
      let up = true;
      for (let right = 20; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let row = 0; row < 21; row++) {
          const y = up ? 20 - row : row;
          for (let j = 0; j < 2; j++) {
            const x = right - j;
            if (m[y][x] === null) {
              const bit = stream[index++] || 0;
              m[y][x] = bit ^ ((x + y) % 2 === 0 ? 1 : 0);
            }
          }
        }
        up = !up;
      }

      const dataFormat = 8;
      let rem = dataFormat << 10;
      for (let i = 14; i >= 10; i--) {
        if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
      }
      const format = ((dataFormat << 10) | rem) ^ 0x5412;
      f1.forEach(([x, y], i) => set(x, y, (format >>> i) & 1));
      f2.forEach(([x, y], i) => set(x, y, (format >>> i) & 1));
      set(8, 13, 1);

      canvas.width = 232;
      canvas.height = 232;
      const c = canvas.getContext('2d');
      c.fillStyle = '#fff';
      c.fillRect(0, 0, 232, 232);
      c.fillStyle = '#142016';
      for (let y = 0; y < 21; y++) {
        for (let x = 0; x < 21; x++) {
          if (m[y][x]) c.fillRect((x + 4) * 8, (y + 4) * 8, 8, 8);
        }
      }
    },
  };

  DRAW.QR = QR;
})();