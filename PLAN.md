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

- **Join code = Camera's PeerJS peer id.** Viewer opens a *data connection* to the Camera (watch request); the Camera then calls the Viewer with the real stream, and the Viewer answers receive-only. Video flows Camera → Viewer. (An offer with no tracks — the earlier draft's Viewer-first `call` with an empty stream — cannot carry media: no m-line exists for the video. Fixed 2026-11-13 after live test.)
- **Camera**: first watch request → call the Viewer with `localStream` (auto-accept, Q7). A request while a Session is live → close it immediately (Q8).
- **Viewer disambiguation** (no control channel — known simplification):
  - `peer-unavailable` error → "No camera found for that code."
  - watch request closed with no media within ~5 s → "Camera is in use."
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

- No TURN server: peers behind symmetric NAT will fail. Documented in README.
- Phone tab-hide pauses the camera at the OS level; Wake Lock mitigates screen sleep only.
- (Busy detection as a heuristic and strict 1:1 were superseded by the 2026-11-20 addendum below.)

---

## Addendum 2026-11-20 — Live broadcast + Chat

Status: approved — user said "all yes" in grill rounds 1–2; supersedes Q6 (no
chat / no multi-viewer) and Q8 (strict 1:1) above. Everything else stands:
PeerJS cloud signaling, no TURN, Join code = Camera peer id, dark instrument
look, no test suite, no linter.

Goal: a YouTube/TikTok-live-shaped practice app, but peer-to-peer — group chat
between Camera and Viewers, and one Camera broadcast to many Viewers at once.

### Topology

- **Media = tree.** Fanout 4 at every node. The Camera calls its direct
  children with `localStream`; a Relay calls its children with the remote
  stream it received (track re-publish — plain WebRTC, no server). Each hop
  adds a small delay; accepted. Depth ≤ 2 holds 20 Viewers, ≤ 3 holds 84.
- **Control + chat = star.** Every Viewer keeps one DataConnection to the
  Camera for the whole Session. Chat messages are tiny, so the phone relays
  chat, never video. The Camera knows every edge, which makes assignment and
  repair possible without a server.

### Settled decisions

| # | Decision | Answer |
|---|----------|--------|
| R1 | Capacity | Fanout 4 at every node, breadth-first assignment (shallowest free slot), no depth cap. `Camera full` stays only as a defensive error (hard node limit 64). |
| R2 | Relaying | Mandatory, camera-assigned. Any Viewer may be picked, desktop or phone. |
| R3 | Repair | Camera-driven: a Relay leaving re-parents its direct children to free slots; sub-branches move as one unit; children heal via `replaceTrack`. Viewer fallbacks: `need-parent` (media dead, control alive) and full re-join (control dead). |
| R4 | Chat history | Camera keeps the last 50 messages in memory, replays to each Viewer on join. Nothing on disk. |
| R5 | Labels | Camera assigns monotonic Viewer numbers (`Viewer 3`), never reused, so history labels stay stable. Own messages render as "You". |
| R6 | Entry | Auto-accept everyone with the Join code, up to tree capacity. No approval step. |
| R7 | Count | Camera pushes `count`; both HUDs show `N watching`. |
| Q1 | Chat | Group: the Camera relays every message to all Viewers; one broadcast order for everyone, sender included. |
| Q5 | Chat life | In memory per Session. No replay after a full re-join beyond the Camera's history. |
| Q6 | Chat UI | Toggle panel with unread dot; Feed stays full-screen. Camera input disabled until a Viewer joins. |
| Q7 | Messages | Plain text, 500-char cap, timestamps, newest at bottom, auto-scroll. No typing indicator, no read receipts, no images. |

### Protocol (typed JSON on the control line)

Camera → Viewer: `assign {viewerNumber, parentId}` · `reassign {parentId}` ·
`adopt {childId}` (to a Relay: call this peer) · `history {messages}` ·
`chat {message}` · `count {n}` · `ended` · `full` (defensive).

Viewer → Camera: `chat {text}` · `need-parent`.

Chat ordering: the Camera appends on receipt and broadcasts one ordered copy
on all lines, including the sender. The sender renders from the echo, so
everyone sees one order.

The `busy` error kind and "Camera is in use" are removed: the Camera answers
with explicit control messages. Kept: `no-camera`, `network`, `failed`, plus
defensive `full`. No media within 8 s of dial or assign: while ICE is still
negotiating the Viewer keeps waiting (absolute cap 30 s per attempt);
otherwise it recovers through `need-parent` or a full re-join before any
error — a slow first hop must not kill a Session that would connect
(widened 2026-11-20 after a live "Connection failed" report).

### Repair flows

- **Relay leaves**: Camera sees the control-line close → re-attaches its
  direct children to free slots (BFS) → `reassign` to each orphan, `adopt` to
  each new parent (or a direct call when the parent is the Camera). Orphans
  keep their own subtrees; deeper children heal via `replaceTrack`.
- **Relay re-parented**: swaps the outgoing video track on its existing child
  calls with `RTCRtpSender.replaceTrack` — seamless, no renegotiation. If it
  throws, it closes and re-calls each child (children accept a replacing call
  from their assigned parent).
- **Viewer fallback**: media closed but control alive → `need-parent` (3
  attempts, 0/2/4 s). Control line dead → full re-join (3 attempts, 1/2/4 s,
  fresh peer id → fresh Viewer number). Exhausted → error.
- **Camera ends**: `ended` to all lines, then teardown. Viewer leaves: its
  line closes; Camera repairs and pushes `count`. Last Viewer gone → Camera
  returns to `waiting`; code and QR stay valid.

### UI

- Camera HUD: `● LIVE 00:04:12  2 watching  K7MQ2` + Chat button with unread
  dot (amber). Waiting overlay unchanged.
- Viewer HUD: `● LIVE K7MQ2 00:04:12  7 watching` + viewfinder brackets +
  `Snapshot · Chat · End`. Chat button carries the unread dot.
- Chat panel: overlay on both sides (bottom sheet on phones, docked card on
  desktop), never shrinks the Feed. Mono voice for sender labels and clocks;
  Instrument Sans for message text. Sender names localize per device
  (`Camera` / `Viewer 3` / `You`).

### Implementation notes

- `src/lib/protocol.ts` — message union + guards + shared limits.
- `src/lib/tree.ts` — camera-side media tree: BFS attach, move (keeps
  subtree), remove (returns orphan roots). Pure logic, no PeerJS.
- Assign race: media can beat its `assign` message. A Viewer accepts one
  blind call before its first assign — only the Camera or its assigned Relay
  can be the caller.
- Relay duties start before media arrives: adopted children queue until the
  Relay's own stream lands (`pendingChildren`).

## Addendum 2026-11-20 — Chat floats

Status: approved — user asked for "every received chat float in feed like true
live chat", floats "bottom left, above the chat input which is always visible
and ready to send at the bottom". Supersedes Q6 (toggle panel + unread dot)
and the Q7 auto-scroll line above. Protocol, star topology, and R4 history
stand unchanged.

- Chat input sits in the bottom bar on both sides, always visible. Camera
  input stays disabled until a Viewer joins; Viewer can send while live or
  reconnecting. A failed send keeps the text.
- Every Chat arrival floats as a transient bubble over the Feed, bottom-left
  above the input; oldest on top, newest at the bottom, max 4 shown, each
  fades after ~5 s. Own messages float too — sender included, one order for
  all. Bubbles ignore pointer events and are aria-hidden.
- History replay never floats: each replay (first join, repair re-join)
  bumps `chatEpoch` on the Viewer; the float cursor resyncs to it.
- No toggle, no unread dot, no scrollback panel. The last 50 stay in memory
  per R4 but have no surface.
- `prefers-reduced-motion` shows bubbles solid for their TTL, no animation.
- Fix on the way: element defaults moved into `@layer base` — the un-layered
  `button { color: inherit }` beat Tailwind v4 utilities, so `bg-paper`
  buttons rendered white with inherited near-white text (invisible labels).
