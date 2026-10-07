'use strict';
(function () {
  const { $, State, UI } = DRAW;

  const Pairing = {
    timeout: null,
    scanStream: null,
    scanning: false,

    wsUrl() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${location.host}/ws`;
    },

    send(msg) {
      if (!State.ws || State.ws.readyState !== WebSocket.OPEN) {
        throw new Error('Signaling is disconnected');
      }
      State.ws.send(JSON.stringify({ ...msg, code: msg.code || State.code }));
    },

    async connect() {
      if (State.ws) {
        State.ws.onclose = null;
        State.ws.close();
        State.ws = null;
      }
      const ws = new WebSocket(this.wsUrl());
      State.ws = ws;

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          ws.close();
          reject(new Error('Signaling server timed out.'));
        }, 10000);
        ws.onopen = () => { clearTimeout(timer); resolve(); };
        ws.onerror = () => { clearTimeout(timer); reject(new Error('Cannot connect to signaling server.')); };
        ws.onmessage = (e) => {
          try { this.message(JSON.parse(e.data)); }
          catch (err) { console.warn('Signaling message rejected:', err); }
        };
        ws.onclose = () => {
          clearTimeout(timer);
          if (State.ws === ws) {
            State.ws = null;
            this.disconnected();
            reject(new Error('Signaling connection closed.'));
          }
        };
      });
    },

    newCode() {
      const bytes = new Uint8Array(10);
      crypto.getRandomValues(bytes);
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      return 'DRAW-' + Array.from(bytes, (b) => alphabet[b % 32]).join('');
    },

    async create() {
      $('connectSignaling').disabled = true;
      $('pairStatus').textContent = 'Connecting…';
      try {
        await this.connect();
        this.send({ type: 'create-session', code: '', role: 'controller' });
        $('pairStatus').textContent = 'Requesting session…';
        this.ackTimeout('Session creation was not acknowledged.');
      } catch (e) {
        $('pairStatus').textContent = e.message;
        $('connectSignaling').disabled = false;
      }
    },

    async join() {
      const code = $('joinCode').value.trim().toUpperCase();
      if (!/^[A-Z0-9-]{6,25}$/.test(code)) {
        UI.toast('Enter the session code shown on Device A.');
        return;
      }
      $('joinSession').disabled = true;
      $('viewerConnectStatus').textContent = 'Connecting to signaling…';
      try {
        await this.connect();
        this.send({ type: 'join-session', code, role: 'viewer' });
        $('viewerConnectStatus').textContent = 'Joining session…';
        this.ackTimeout('Join was not acknowledged. Check the code.');
      } catch (e) {
        $('viewerConnectStatus').textContent = e.message;
        $('joinSession').disabled = false;
      }
    },

    ackTimeout(message) {
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        $('pairStatus').textContent = message;
        $('viewerConnectStatus').textContent = message;
        $('connectSignaling').disabled = false;
        $('joinSession').disabled = false;
      }, 12000);
    },

    async message(msg) {
      switch (msg.type) {
        case 'session-created': {
          if (State.role !== 'controller' || !/^[A-Z0-9-]{6,25}$/.test(msg.code || '')) return;
          clearTimeout(this.timeout);
          State.code = msg.code;
          $('sessionSetup').classList.add('hidden');
          $('sessionResult').classList.remove('hidden');
          $('sessionCode').textContent = State.code;
          DRAW.QR.draw(State.code, $('qrCanvas'));
          $('pairStatus').textContent = 'Session created. Waiting for Device B.';
          $('connectSignaling').disabled = false;
          UI.update();
          break;
        }
        case 'session-joined': {
          if (State.role !== 'viewer' || !/^[A-Z0-9-]{6,25}$/.test(msg.code || '')) return;
          clearTimeout(this.timeout);
          State.code = msg.code;
          State.paired = true;
          $('joinSession').disabled = false;
          $('viewerLive').classList.remove('hidden');
          $('viewerWaiting').classList.remove('hidden');
          $('viewerWaitingText').textContent = 'Paired. Waiting for the controller to start…';
          $('viewerLiveStatus').textContent = 'Paired with ' + State.code;
          $('viewerLive').requestFullscreen?.().catch(() => {});
          UI.update();
          break;
        }
        case 'peer-joined': {
          if (State.role !== 'controller' || !State.code) return;
          State.paired = true;
          $('pairStatus').textContent = 'Device B paired. Enable the camera and start your live view.';
          UI.toast('Device B is paired and ready.');
          UI.update();
          break;
        }
        case 'signal':
          await DRAW.Streaming.signal(msg.payload);
          break;
        case 'stream-state': {
          if (State.role === 'viewer') {
            $('viewerWaiting').classList.toggle('hidden', !!msg.active && !!$('remoteVideo').srcObject);
            $('viewerWaitingText').textContent = msg.active
              ? 'Receiving live video…'
              : 'Controller paused the live view.';
            if (msg.output) {
              $('viewerLiveStatus').textContent =
                `LIVE · ${msg.output.resolution}p · ${msg.output.fps} FPS · ${msg.output.quality}`;
            }
          }
          break;
        }
        case 'peer-left': {
          State.paired = false;
          DRAW.Streaming.close();
          State.live = false;
          $('viewerWaiting').classList.remove('hidden');
          $('viewerWaitingText').textContent = 'Controller disconnected. Leave this view to reconnect.';
          $('pairStatus').textContent = 'Viewer left. Share your code to pair again.';
          UI.update();
          UI.toast('The other device left the session.');
          break;
        }
        case 'error': {
          clearTimeout(this.timeout);
          const m = msg.message || 'Signaling error.';
          $('pairStatus').textContent = m;
          $('viewerConnectStatus').textContent = m;
          $('connectSignaling').disabled = false;
          $('joinSession').disabled = false;
          break;
        }
      }
    },

    disconnected() {
      clearTimeout(this.timeout);
      State.paired = false;
      State.code = '';
      DRAW.Streaming.close();
      State.live = false;
      $('sessionSetup').classList.remove('hidden');
      $('sessionResult').classList.add('hidden');
      $('connectSignaling').disabled = false;
      $('joinSession').disabled = false;
      $('pairStatus').textContent = 'Signaling disconnected. Reconnect to create a new session.';
      $('viewerWaiting').classList.remove('hidden');
      $('viewerWaitingText').textContent = 'Connection lost. Leave this view to reconnect.';
      UI.update();
    },

    leave() {
      try { this.send({ type: 'leave-session' }); } catch {}
      if (State.ws) {
        State.ws.onclose = null;
        State.ws.close();
        State.ws = null;
      }
      clearTimeout(this.timeout);
      DRAW.Streaming.close();
      State.code = '';
      State.paired = false;
      State.live = false;
      this.stopScan();
      $('viewerLive').classList.add('hidden');
      $('remoteVideo').srcObject = null;
      $('sessionSetup').classList.remove('hidden');
      $('sessionResult').classList.add('hidden');
      $('connectSignaling').disabled = false;
      $('joinSession').disabled = false;
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      UI.update();
    },

    async scan() {
      if (this.scanning) { this.stopScan(); return; }
      if (!('BarcodeDetector' in window)) {
        UI.toast('QR scanning is not supported by this browser. Enter the session code instead.');
        return;
      }
      try {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (!formats.includes('qr_code')) throw new Error('QR scanning is not supported. Enter the code instead.');
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        this.scanStream = await navigator.mediaDevices.getUserMedia({
          audio: false, video: { facingMode: 'environment' },
        });
        $('scanVideo').srcObject = this.scanStream;
        $('scanVideo').classList.remove('hidden');
        await $('scanVideo').play();
        this.scanning = true;
        $('scanCode').textContent = 'Stop scanning';
        const tick = async () => {
          if (!this.scanning) return;
          try {
            const codes = await detector.detect($('scanVideo'));
            const found = codes.find((c) => /^[A-Z0-9-]{6,25}$/.test(c.rawValue));
            if (found) {
              $('joinCode').value = found.rawValue;
              this.stopScan();
              UI.toast('Session code scanned. Tap Connect to pair.');
              return;
            }
          } catch {}
          setTimeout(tick, 250);
        };
        tick();
      } catch (e) {
        this.stopScan();
        UI.toast(e.message || 'Unable to open the scanning camera.');
      }
    },

    stopScan() {
      this.scanning = false;
      this.scanStream?.getTracks().forEach((t) => t.stop());
      this.scanStream = null;
      $('scanVideo').srcObject = null;
      $('scanVideo').classList.add('hidden');
      $('scanCode').innerHTML = '<svg><use href="#i-qr"/></svg>Scan session QR';
    },
  };

  DRAW.Pairing = Pairing;
})();