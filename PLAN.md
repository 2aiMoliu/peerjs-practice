---
version: 1
date: 2026-11-13
status: approved — user said "all yes" in all grill rounds; build may start after this file
---

# PLAN — peerjs-practice

Live camera feed from a smartphone, watched on a desktop browser, device to device. PeerJS over WebRTC, Solid UI, Tailwind v4, Bun tooling. Deployed on GitHub Pages by GitHub Actions.

Grill session: 3 rounds, frontier empty. Decision record below is complete — no open branches.

## Settled decisions

| # | Decision | Answer |
|---|----------|--------|
| Q1 | Stack | Vite + official `solid-ts` SPA (no SolidStart), TypeScript, Tailwind v4 via `@tailwindcss/vite`, Bun for install/dev/build/CI. No router — modes by query param. |
| Q2 | Audio | Video only. No microphone. |
| Q3 | Join UX | 6-char Join code + shareable link + QR on the Viewer start screen (`qrcode` npm). |
| Q4 | Signaling | PeerJS Cloud (`0.peerjs.com`), all settings in one module for a one-edit swap. Flake risk accepted. |
| Q5 | Phone dev | `@vitejs/plugin-basic-ssl` — HTTPS on LAN, accept self-signed warning once. |
| Q6 | Scope tier | B: core + Snapshot + auto-reconnect. No chat, no multi-viewer mesh. |
| Q7 | Phone behavior | Auto-accept first Viewer. Wake Lock while streaming. Track mute → `Feed interrupted` state. |
| Q8 | Second Viewer | Strict 1:1. Second Viewer rejected → sees "Camera is in use". |
| Q9 | Look | Dark minimal. One screen per mode. Feed fills viewport; controls in a small overlay. Distinct identity per `$frontend-design`, minimalistic preferred. |
| — | Deploy | Push to `main` + manual `workflow_dispatch` → Pages. Base path `/peerjs-practice/`. |
| — | Tooling | No test suite, no linter. App code at repo root. |
| — | Domain terms | See [GLOSSARY.md](GLOSSARY.md): Camera, Viewer, Join code, Feed, Session, Snapshot, Feed interrupted. |
| — | ADRs | None. Every choice here is reversible (signaling swap = one module; host swap = one workflow). |

## Architecture

```
src/
  index.tsx                 entry, font + css imports
  App.tsx                   reads ?mode= → Landing | CameraView | ViewerView
  app.css                   Tailwind v4 @theme tokens (design plan below)
  views/
    Landing.tsx             pick a role
    CameraView.tsx          phone side
    ViewerView.tsx          desktop side
  lib/
    peer-config.ts          Q4: cloud signaling + ICE, isolated for swap
    codes.ts                Join code: 6 chars, unambiguous alphabet (no 0 O 1 I L)
    camera-session.ts       camera role logic → Solid signals
    viewer-session.ts       viewer role logic → Solid signals
    util.ts                 timecode fmt, URL helpers
```

### Protocol decisions (implementation-set, recorded)

- **Join code = Camera's PeerJS peer id.** Viewer's `peer.call(code, new MediaStream())` — empty stream is legal; the Camera answers with the real one. Video flows Camera → Viewer.
- **Camera**: first incoming call → `call.answer(localStream)` (auto-accept, Q7). Later calls while a Session is live → `call.close()` immediately (Q8).
- **Viewer disambiguation** (no control channel — known simplification):
  - `peer-unavailable` error → "No camera found for that code."
  - call closes with no media within ~2 s → "Camera is in use."
- **Auto-reconnect (viewer, Q6)**: unexpected close after media → retry `call()` up to 3×, backoff 1/2/4 s, UI "Reconnecting…". User hang-up never retries.
- **Camera reconnect**: `peer.on('disconnected')` → `peer.reconnect()` — keeps the same id, so the Join code and QR stay valid.
- **Feed interrupted (Q7)**: remote `videoTrack.onmute` → interrupted; `onunmute` → live. Covers phone tab-hide; Wake Lock covers screen-off.
- **Camera source**: `getUserMedia({ video: { facingMode: 'environment' } })`, fallback to plain `video` on `OverconstrainedError`. Permission denied → explicit retry message.
- **Autoplay**: `<video muted playsinline>` — required on mobile browsers.
- **URLs**: `?mode=camera` · `?mode=view&code=XXXXXX`; QR encodes `origin + import.meta.env.BASE_URL + '?mode=camera'` (correct in dev and prod).
- **Snapshot**: draw video frame to canvas → PNG → `snapshot-<code>-<hhmmss>.png` download.

## Design plan (`$frontend-design`, two passes)

Subject: a monitoring feed — camera-instrument vernacular, not a dashboard. Audience: one developer pointing a phone at something and watching from a desk. Primary job: feed on screen, state legible at a glance, zero decoration.

### Tokens

Color — "viewing room" dark, red reserved for *live*:

| Token | Hex | Use |
|-------|-----|-----|
| Room | `#101312` | background, cool deep grey-green |
| Panel | `#191D1B` | raised surfaces (input, HUD bar) |
| Hairline | `#2A302D` | rules and borders only |
| Paper | `#E8ECE9` | text |
| Fog | `#8A948E` | secondary text, idle |
| Signal | `#E5484D` | live dot, destructive |
| Caution | `#D8A03D` | Feed interrupted |

Type: one UI family + one HUD family.
- **Instrument Sans** (variable) — all UI text, sentence case, 400/500/600.
- **IBM Plex Mono** 400/500 — only camera data: Join code, live timecode, status words. The mono face is the instrument voice, used *only* where a camera would print text.

Layout (left-aligned, edge-anchored; center only for the code moment):
- Landing — headline, then two stacked role rows, full-width tap targets (phone-first).

```
┌──────────────────────────────┐
│ Put a phone camera           │
│ on a desktop screen.         │
│                              │
│ ┌──────────────────────────┐ │
│ │ Open a camera            │ │
│ │ use this phone as source │ │
│ ├──────────────────────────┤ │
│ │ Watch a feed             │ │
│ │ enter a code             │ │
│ └──────────────────────────┘ │
│ practice build · PeerJS cloud│
└──────────────────────────────┘
```

- Camera — local preview fills viewport; while waiting, a dim overlay carries the Join code (large mono) + copy-link; when live, code collapses into the HUD.

```
┌──────────────────────────────┐
│ ● LIVE 00:04:12        K7MQ2 │  ← HUD bar (live)
│                              │
│        [local preview]       │
│                              │
│              [ End feed ]    │  ← bottom-right, quiet
└──────────────────────────────┘
```

- Viewer start — split: left "Enter the code" (6-char input), right QR with one helper line.

```
┌──────────────────────────────┐
│ Watch a feed                 │
│ ┌────────────┐  ┌──────────┐ │
│ │ Enter the  │  │ [QR]     │ │
│ │ code       │  │ scan on  │ │
│ │ [ K7 M Q 2]│  │ the phone│ │
│ │ [ Watch ]  │  │ [copy ⇗] │ │
│ └────────────┘  └──────────┘ │
└──────────────────────────────┘
```

- Viewer live — Feed fills viewport; four corner brackets (the viewfinder, the one bold element) + top HUD (live dot, code, timecode) + bottom overlay (Snapshot, End).

```
┌──────────────────────────────┐
│ ● LIVE K7MQ2  00:04:12       │
│ ┌─                         ─┐ │
│ │        [the feed]         │ │
│ └─                         ─┘ │
│         [Snapshot] [End]     │
└──────────────────────────────┘
```

Principles:
1. **Instrument, not dashboard.** Everything visible is camera vernacular: code, LIVE, timecode, brackets. No cards, no shadows, no gradient washes.
2. **Color is state.** Red only when a Session is live. Amber only when interrupted. Never decoration.
3. **One bold element.** The viewfinder chrome on the live Feed. Everything else quiet.
4. **Copy = verbs + glossary nouns.** "Open a camera", "Watch a feed", "Waiting for a viewer", "Feed ended". Errors state cause + fix, no apology.
5. **Motion**: only the live dot pulse (non-user, status attention). Respects `prefers-reduced-motion`. Everything else changes instantly on state.

### Pass 2 — review against AI-default tells (and verdicts)

- *near-black bg + single acid-green/vermilion accent*: dark is user-pinned (Q9); accent is **Signal red chosen because REC is the subject's most honest mark** — not acid-green trend color. Kept, with justification.
- *mono for small data labels*: mono restricted to camera-printed data only, not labels like "STEP 01". Kept as subject voice.
- *SaaS cards / one radius everywhere*: no cards; hairlines only under HUD; `rounded` (4 px) only on interactive controls, HUD square. Kept with the split.
- *ALL-CAPS eyebrows, middle-dot meta, '→' buttons, em-dash labels*: none. Status text sentence case.
- *cream/terracotta, broadsheet hairline-everywhere*: absent.
- Copy check: no "Submit", no filler. Buttons say the act: "Watch", "Snapshot", "End feed", "Try again".

## Build order

1. Scaffold `solid-ts` template (temp dir → repo root; keep LICENSE, docs/, GLOSSARY.md, PLAN.md).
2. Deps: `peerjs tailwindcss @tailwindcss/vite qrcode @fontsource-variable/instrument-sans @fontsource/ibm-plex-mono` + dev `@vitejs/plugin-basic-ssl @types/qrcode`.
3. `vite.config.ts`: base `/peerjs-practice/`, solid + tailwind + basic-ssl (serve only), `server.host` for LAN phone testing.
4. Source files per Architecture, copy per design plan.
5. `.github/workflows/deploy.yml`: checkout → `oven-sh/setup-bun@v2` → `bun install --frozen-lockfile` → `bun run build` → configure-pages → upload-pages-artifact → deploy-pages. `permissions: pages:write, id-token:write`. Concurrency group `pages`.
6. `bun run build` (tsc + vite) until clean.
7. Short README.
8. Commit, push `main`, ensure Pages source = GitHub Actions (`gh api … /pages -f build_type=workflow`), report site URL.

## Known simplifications (recorded, accepted)

- Busy detection is a close-timing heuristic, not a control message.
- No TURN server: peers behind symmetric NAT will fail. Documented in README.
- Phone tab-hide pauses the camera at the OS level; Wake Lock mitigates screen sleep only.
- Strict 1:1: second Viewer always rejected.
