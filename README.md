# peerjs-practice

Live camera feed from a smartphone, watched on desktop browsers, device to device. PeerJS over WebRTC, Solid, Tailwind v4, Bun. Deployed on GitHub Pages.

- Open the site on a phone → "Open a camera" → it shows a 6-character Join code and a QR link.
- Open the site on desktops → "Watch a feed" → type the code → the feed fills the screen.
- One Camera broadcasts to many Viewers at once: the feed flows through a relay tree (each Viewer forwards to up to 4 more, assigned by the Camera).
- Group chat between the Camera and all Viewers, with history replay for late joiners. Both HUDs show how many are watching.

## Limits (accepted in PLAN.md)

- Signaling goes through the PeerJS cloud server (`0.peerjs.com`); media is peer-to-peer.
- No TURN server: peers behind symmetric NAT will fail to connect.
- No media server: the Camera uploads one feed copy per direct Viewer, and every Relay uploads one per its children. Fanout 4 keeps that bounded; depth adds a little latency per hop.
- Tree repair is best-effort: a Viewer under a Relay that closes re-attaches automatically, with a brief "Feed interrupted" gap.
- No chat storage: the transcript lives in memory for the Session only.

## Dev

```sh
bun install
bun run dev   # HTTPS on the LAN, so a real phone can open the camera
```

Full decision record: [PLAN.md](PLAN.md). Terms: [GLOSSARY.md](GLOSSARY.md).
