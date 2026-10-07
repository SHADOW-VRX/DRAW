'use strict';
(function () {
  const { $, State, UI } = DRAW;

  const Streaming = {
    sender: null,
    viewerTimer: null,
    iceCache: null,

    /**
     * Fetch ICE servers from the backend. Falls back to a public STUN
     * server if the endpoint is unavailable (e.g. during local dev with
     * no TURN configured).
     */
    async iceServers() {
      if (this.iceCache) return this.iceCache;
      try {
        const res = await fetch('/api/ice-config', {
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.iceServers) && data.iceServers.length) {
            this.iceCache = data.iceServers;
            return this.iceCache;
          }
        }
      } catch {
        /* fall through to default */
      }
      this.iceCache = [{ urls: 'stun:stun.l.google.com:19302' }];
      return this.iceCache;
    },

    async makePeer() {
      if (!window.RTCPeerConnection) {
        throw new Error('WebRTC is unavailable in this browser.');
      }
      if (State.pc) {
        State.pc.close();
        State.pc = null;
      }
      const iceServers = await this.iceServers();
      const pc = new RTCPeerConnection({ iceServers });
      State.pc = pc;
      State.pendingIce = [];

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          try {
            DRAW.Pairing.send({
              type: 'signal',
              payload: { type: 'ice', candidate: e.candidate.toJSON() },
            });
          } catch {}
        }
      };

      pc.onconnectionstatechange = () => {
        if (State.pc !== pc) return;
        State.connected = pc.connectionState === 'connected';
        UI.update();
        if (State.connected) {
          UI.toast('Live WebRTC connection established.');
          if (State.role === 'viewer') {
            $('viewerLiveStatus').textContent = 'LIVE · Connected to ' + State.code;
            this.viewerWake();
          }
        }
        if (['failed', 'disconnected'].includes(pc.connectionState)) {
          $('viewerWaiting').classList.remove('hidden');
          $('viewerWaitingText').textContent =
            'Video connection interrupted. Waiting to reconnect…';
          UI.toast(
            pc.connectionState === 'failed'
              ? 'WebRTC failed. Check your network or configure a TURN relay.'
              : 'Video connection interrupted.'
          );
        }
      };

      pc.ontrack = (e) => {
        $('remoteVideo').srcObject = e.streams[0] || new MediaStream([e.track]);
        $('remoteVideo')
          .play()
          .then(() => {
            $('viewerWaiting').classList.add('hidden');
            this.viewerWake();
          })
          .catch(() => {
            $('viewerWaitingText').textContent = 'Tap the screen to play live video.';
            $('viewerWaiting').onclick = () => {
              $('remoteVideo')
                .play()
                .then(() => $('viewerWaiting').classList.add('hidden'))
                .catch(() => {});
            };
          });
        e.track.onmute = () => {
          $('viewerWaiting').classList.remove('hidden');
          $('viewerWaitingText').textContent = 'Waiting for video from the controller…';
        };
        e.track.onunmute = () => $('viewerWaiting').classList.add('hidden');
      };

      return pc;
    },

    async start() {
      if (State.live) {
        this.stop();
        return;
      }
      if (!State.cameraReady || !State.paired) return;
      if (!DRAW.AR.canvas.captureStream) {
        UI.toast('Canvas streaming is not supported in this browser.');
        return;
      }
      try {
        $('startLive').disabled = true;
        const pc = await this.makePeer();
        DRAW.AR.render();
        State.outputStream = DRAW.AR.canvas.captureStream(State.fps);
        this.sender = pc.addTrack(
          State.outputStream.getVideoTracks()[0],
          State.outputStream
        );
        State.live = true;
        await this.quality();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        DRAW.Pairing.send({
          type: 'signal',
          payload: { type: 'offer', sdp: pc.localDescription.sdp },
        });
        DRAW.Pairing.send({
          type: 'stream-state',
          active: true,
          output: this.output(),
        });
        UI.update();
        UI.toast('Connecting the live canvas to Device B…');
      } catch (e) {
        this.close();
        State.live = false;
        UI.update();
        UI.toast('Could not start live view: ' + e.message);
      }
    },

    output() {
      return {
        resolution: State.resolution,
        fps: State.fps,
        quality: State.quality,
      };
    },

    stop() {
      State.live = false;
      if (State.outputStream) {
        State.outputStream.getTracks().forEach((t) => (t.enabled = false));
      }
      try {
        DRAW.Pairing.send({
          type: 'stream-state',
          active: false,
          output: this.output(),
        });
      } catch {}
      this.close();
      UI.update();
      UI.toast('Live view stopped. Your camera remains available.');
    },

    close() {
      if (State.pc) {
        State.pc.close();
        State.pc = null;
      }
      State.outputStream?.getTracks().forEach((t) => t.stop());
      State.outputStream = null;
      State.connected = false;
      State.pendingIce = [];
      this.sender = null;
    },

    async signal(payload) {
      if (!payload || !State.code) return;
      try {
        if (payload.type === 'offer' && State.role === 'viewer') {
          const pc = await this.makePeer();
          await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
          await this.flushIce();
          await pc.setLocalDescription(await pc.createAnswer());
          DRAW.Pairing.send({
            type: 'signal',
            payload: { type: 'answer', sdp: pc.localDescription.sdp },
          });
        } else if (
          payload.type === 'answer' &&
          State.role === 'controller' &&
          State.pc
        ) {
          await State.pc.setRemoteDescription({
            type: 'answer',
            sdp: payload.sdp,
          });
          await this.flushIce();
        } else if (payload.type === 'ice' && payload.candidate) {
          if (State.pc?.remoteDescription) {
            await State.pc.addIceCandidate(payload.candidate);
          } else {
            State.pendingIce.push(payload.candidate);
          }
        }
      } catch (e) {
        console.error(e);
        UI.toast('Video negotiation failed. Check signaling and network.');
      }
    },

    async flushIce() {
      const candidates = State.pendingIce.splice(0);
      for (const candidate of candidates) {
        await State.pc.addIceCandidate(candidate);
      }
    },

    async quality() {
      if (!this.sender) return;
      const p = this.sender.getParameters();
      if (!p.encodings?.length) p.encodings = [{}];
      const base =
        { Low: 1, Medium: 2.5, High: 5, Ultra: 10 }[State.quality] * 1_000_000;
      p.encodings[0].maxBitrate = Math.round(
        base * (State.resolution / 1080) ** 1.4 * (State.fps / 30)
      );
      p.encodings[0].maxFramerate = State.fps;
      try {
        await this.sender.setParameters(p);
      } catch {
        UI.toast('This browser uses its own video encoding quality.');
      }
    },

    async reconfigure() {
      if (State.live && this.sender) {
        const old = State.outputStream;
        try {
          const stream = DRAW.AR.canvas.captureStream(State.fps);
          await this.sender.replaceTrack(stream.getVideoTracks()[0]);
          State.outputStream = stream;
          old?.getTracks().forEach((t) => t.stop());
          await this.quality();
          DRAW.Pairing.send({
            type: 'stream-state',
            active: true,
            output: this.output(),
          });
        } catch {
          UI.toast('Output could not be changed. Restart the live view.');
        }
      }
    },

    viewerWake() {
      const el = $('viewerLive');
      el.classList.remove('idle');
      clearTimeout(this.viewerTimer);
      this.viewerTimer = setTimeout(() => el.classList.add('idle'), 3500);
    },
  };

  DRAW.Streaming = Streaming;
})();