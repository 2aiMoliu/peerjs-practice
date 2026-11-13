# peerjs-practice

Live camera feed from a smartphone, watched on a desktop browser, device to device. PeerJS over WebRTC, Solid, Tailwind v4, Bun. Deployed on GitHub Pages.

- Open the site on a phone → "Open a camera" → it shows a 6-character Join code and a QR link.
- Open the site on a desktop → "Watch a feed" → type the code → the feed fills the screen.
- One viewer at a time. A second viewer sees "Camera is in use."

## Limits (accepted in PLAN.md)

- Signaling goes through the PeerJS cloud server (`0.peerjs.com`); media is peer-to-peer.
- No TURN server: peers behind symmetric NAT will fail to connect.
- Busy detection is a close-timing heuristic, not a control message.

## Dev

```sh
bun install
bun run dev   # HTTPS on the LAN, so a real phone can open the camera
```

Full decision record: [PLAN.md](PLAN.md). Terms: [GLOSSARY.md](GLOSSARY.md).
