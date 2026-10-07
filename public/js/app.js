'use strict';
(function () {
  /* ------------------------------------------------------------------ */
  /* Resolve the DRAW namespace and its modules                          */
  /* ------------------------------------------------------------------ */
  const DRAW = window.DRAW;
  if (!DRAW) {
    console.error('[DRAW] namespace missing — state.js did not load. ' +
      'Check that /js/state.js is reachable and loads before app.js.');
    return;
  }

  const { $, State, UI } = DRAW;
  const { Camera, Artwork, AR, Calibration, Pairing, Streaming } = DRAW;

  if (!$ || !State || !UI) {
    console.error('[DRAW] core modules missing on DRAW:', {
      $: !!$,
      State: !!State,
      UI: !!UI,
    });
    return;
  }

  if (!Camera || !Artwork || !AR || !Calibration || !Pairing || !Streaming) {
    console.error('[DRAW] one or more feature modules failed to load:', {
      Camera: !!Camera,
      Artwork: !!Artwork,
      AR: !!AR,
      Calibration: !!Calibration,
      Pairing: !!Pairing,
      Streaming: !!Streaming,
    });
    return;
  }

  /* ------------------------------------------------------------------ */
  /* Mode tabs                                                           */
  /* ------------------------------------------------------------------ */
  $('controllerTab').onclick = () => UI.role('controller');
  $('viewerTab').onclick = () => UI.role('viewer');
  $('helpButton').onclick = () => $('helpDialog').showModal();

  document.querySelectorAll('[data-close]').forEach((b) => {
    b.onclick = () => $(b.dataset.close).close();
  });

  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        ) {
          d.close();
        }
      }
    });
  });

  /* ------------------------------------------------------------------ */
  /* Accordions                                                          */
  /* ------------------------------------------------------------------ */
  document.querySelectorAll('.accordion-heading').forEach((b) => {
    b.onclick = () => {
      const expanded = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', !expanded);
      $(b.getAttribute('aria-controls')).classList.toggle('hidden', expanded);
    };
  });

  /* ------------------------------------------------------------------ */
  /* Camera                                                              */
  /* ------------------------------------------------------------------ */
  $('enableCamera').onclick = () => Camera.start(State.cameraReady);

  /* ------------------------------------------------------------------ */
  /* Artwork                                                             */
  /* ------------------------------------------------------------------ */
  $('uploadButton').onclick = () => $('imageUpload').click();

  $('imageUpload').onchange = (e) => {
    Artwork.upload(e.target.files[0]);
    e.target.value = '';
  };

  $('removeArt').onclick = () => {
    State.art = null;
    Artwork.dirty = true;
    Artwork.outline = null;
    $('artName').textContent = 'No artwork selected';
    $('artMeta').textContent = 'Upload an image to begin';
    $('artThumb').removeAttribute('src');
    UI.toast('Artwork removed.');
  };

  $('opacity').oninput = (e) => {
    State.opacity = +e.target.value / 100;
    $('opacityValue').textContent = e.target.value + '%';
  };

  /* ------------------------------------------------------------------ */
  /* Transform                                                           */
  /* ------------------------------------------------------------------ */
  for (const [id, key, scale, suffix] of [
    ['zoom', 'zoom', 100, '%'],
    ['rotation', 'rotation', 1, '°'],
    ['positionX', 'x', 100, '%'],
    ['positionY', 'y', 100, '%'],
  ]) {
    $(id).oninput = (e) => {
      State[key] = +e.target.value / scale;
      $(id + 'Value').textContent = e.target.value + suffix;
      Artwork.dirty = true;
    };
  }

  for (const key of ['flipX', 'flipY']) {
    $(key).onclick = () => {
      State[key] = !State[key];
      $(key).setAttribute('aria-pressed', State[key]);
      $(key).classList.toggle('primary', State[key]);
      Artwork.dirty = true;
    };
  }

  $('resetTransform').onclick = () => {
    State.zoom = 1;
    State.rotation = State.x = State.y = 0;
    State.flipX = State.flipY = false;
    for (const [id, val, suffix] of [
      ['zoom', 100, '%'],
      ['rotation', 0, '°'],
      ['positionX', 0, '%'],
      ['positionY', 0, '%'],
    ]) {
      $(id).value = val;
      $(id + 'Value').textContent = val + suffix;
    }
    for (const id of ['flipX', 'flipY']) {
      $(id).setAttribute('aria-pressed', 'false');
      $(id).classList.remove('primary');
    }
    Artwork.dirty = true;
    UI.toast('Artwork transform reset.');
  };

  /* ------------------------------------------------------------------ */
  /* Dimensions                                                          */
  /* ------------------------------------------------------------------ */
  for (const [id, key] of [
    ['wallWidth', 'width'],
    ['wallHeight', 'height'],
  ]) {
    $(id).onchange = (e) => {
      const v = +e.target.value;
      if (!Number.isFinite(v) || v <= 0 || v > 10000) {
        e.target.value = State[key];
        UI.toast('Enter a dimension between 0.01 and 10,000.');
        return;
      }
      State[key] = v;
      UI.update();
    };
  }

  $('units').onchange = (e) => {
    const meters = { m: 1, cm: 0.01, ft: 0.3048, in: 0.0254 };
    const factor = meters[State.units] / meters[e.target.value];
    State.width *= factor;
    State.height *= factor;
    State.units = e.target.value;
    $('wallWidth').value = +State.width.toFixed(3);
    $('wallHeight').value = +State.height.toFixed(3);
    UI.update();
  };

  /* ------------------------------------------------------------------ */
  /* Grid / guides                                                       */
  /* ------------------------------------------------------------------ */
  for (const [id, key] of [
    ['gridTool', 'grid'],
    ['gridSwitch', 'grid'],
    ['guidesTool', 'guides'],
    ['guideSwitch', 'guides'],
    ['measureSwitch', 'measure'],
    ['ghostSwitch', 'ghost'],
  ]) {
    $(id).onclick = () => {
      State[key] = !State[key];
      if (key === 'ghost') Artwork.dirty = true;
      UI.update();
    };
  }

  $('gridSize').onchange = (e) => {
    State.divisions = Math.max(2, Math.min(30, Math.round(+e.target.value) || 6));
    e.target.value = State.divisions;
  };

  /* ------------------------------------------------------------------ */
  /* Calibration                                                         */
  /* ------------------------------------------------------------------ */
  $('calibrateButton').onclick = () => Calibration.calibrate();
  $('lockButton').onclick = () => Calibration.lock();

  /* ------------------------------------------------------------------ */
  /* Viewport tools                                                      */
  /* ------------------------------------------------------------------ */
  $('fullscreenButton').onclick = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if ($('viewport').requestFullscreen) {
        await $('viewport').requestFullscreen();
      } else {
        UI.toast('Fullscreen is unavailable. Rotate your device for a larger canvas.');
      }
    } catch {
      UI.toast('Fullscreen was not allowed by this browser.');
    }
  };

  document.addEventListener('fullscreenchange', () => {
    $('viewport').classList.toggle(
      'is-fullscreen',
      document.fullscreenElement === $('viewport')
    );
  });

  $('snapshotButton').onclick = () => {
    AR.render();
    AR.canvas.toBlob((blob) => {
      if (!blob) {
        UI.toast('Snapshot could not be created.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `draw-${State.cameraReady ? 'canvas' : 'demo'}-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      UI.toast(
        State.cameraReady
          ? 'Canvas snapshot saved.'
          : 'Demo canvas snapshot saved. No camera feed was captured.'
      );
    }, 'image/png');
  };

  /* ------------------------------------------------------------------ */
  /* Streaming output                                                    */
  /* ------------------------------------------------------------------ */
  for (const id of ['resolution', 'fps', 'quality']) {
    $(id).onchange = async () => {
      State.resolution = +$('resolution').value;
      State.fps = +$('fps').value;
      State.quality = $('quality').value;
      AR.resize();
      UI.update();
      await Camera.apply();
      await Streaming.reconfigure();
    };
  }

  /* ------------------------------------------------------------------ */
  /* Pairing                                                             */
  /* ------------------------------------------------------------------ */
  $('createSession').onclick = () => $('pairDialog').showModal();
  $('connectSignaling').onclick = () => Pairing.create();
  $('joinSession').onclick = () => Pairing.join();

  $('joinCode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') Pairing.join();
  });

  $('copyCode').onclick = async () => {
    try {
      await navigator.clipboard.writeText(State.code);
      UI.toast('Session code copied.');
    } catch {
      UI.toast('Session code: ' + State.code);
    }
  };

  $('startLive').onclick = () => Streaming.start();
  $('scanCode').onclick = () => Pairing.scan();
  $('exitViewer').onclick = () => Pairing.leave();

  /* ------------------------------------------------------------------ */
  /* Viewer wake                                                         */
  /* ------------------------------------------------------------------ */
  $('viewerLive').addEventListener('pointermove', () => Streaming.viewerWake());
  $('viewerLive').addEventListener('pointerdown', () => Streaming.viewerWake());

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('viewerLive').classList.contains('hidden')) {
      Streaming.viewerWake();
    }
  });

  /* ------------------------------------------------------------------ */
  /* Pair dialog cleanup                                                 */
  /* ------------------------------------------------------------------ */
  $('pairDialog').addEventListener('close', () => {
    if (State.ws && !State.code) {
      State.ws.onclose = null;
      State.ws.close();
      State.ws = null;
      clearTimeout(Pairing.timeout);
      $('connectSignaling').disabled = false;
    }
  });

  /* ------------------------------------------------------------------ */
  /* Unload                                                              */
  /* ------------------------------------------------------------------ */
  window.addEventListener('beforeunload', () => {
    try {
      Pairing.send({ type: 'leave-session' });
    } catch {}
    State.camera?.getTracks().forEach((t) => t.stop());
    State.outputStream?.getTracks().forEach((t) => t.stop());
    State.pc?.close();
    State.ws?.close();
  });

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */
  Artwork.init();
  AR.init();
  Calibration.init();
  UI.update();

  /* ------------------------------------------------------------------ */
  /* Deep-link: ?mode=viewer&code=XXXX                                   */
  /* ------------------------------------------------------------------ */
  const params = new URLSearchParams(location.search);
  if (params.get('mode') === 'viewer') {
    UI.role('viewer');
    if (params.get('code')) {
      $('joinCode').value = params.get('code').toUpperCase();
    }
  }
})();