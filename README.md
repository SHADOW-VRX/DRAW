# DRAW

**Your wall. Your vision.**

DRAW is a two-device AR mural/tracing system.

- **Device A — Controller:** camera + artwork + calibration + streaming.
- **Device B — Live viewer:** the live drawing monitor.

Media travels **peer-to-peer over WebRTC**. The Node.js backend only handles session creation, WebSocket signaling, and pairing. No artwork, video, or personal data is stored on the server.

---

## Features

- Real camera access via `getUserMedia`
- Reference image upload (PNG/JPEG/WebP/AVIF/SVG)
- 4-point wall calibration with perspective homography
- Calibration lock / recalibrate
- Overlay transform: zoom, rotation, position, flip, opacity
- Grid, measurements, crosshair guides, ghost outline
- Resolution / FPS / quality control (480p → 2160p, 24/30/60 FPS)
- Short session-code pairing (e.g. `DRAW-X7K9P2M4QF`)
- QR code generation for the session code
- WebRTC live streaming to a second device
- Responsive, mobile-first UI
- No external database — sessions live in memory and expire automatically

---

## Requirements

- **Node.js 18+**
- A modern browser (Chrome, Edge, Safari, Firefox)
- Camera access requires **HTTPS** or **localhost**

---

## Install & run

```bash
npm install
cp .env.example .env
npm start