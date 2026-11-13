---
date: 2026-11-13
status: current
topic: stack research for peerjs-practice (PeerJS + Solid + Tailwind + Bun + GitHub Pages)
---

# Stack research — 2026-11-13

## PeerJS

- Latest release: **1.5.5** (npm, published 2025-06-07). MIT.
- Wraps browser WebRTC. Two connection types: `MediaConnection` (audio/video) and `DataConnection` (arbitrary data).
- Default signaling: **PeerJS Cloud** (`0.peerjs.com`, port 443). Free, rate-limited, no SLA. Status page: status.peerjs.com.
- Self-host option: the `peer` npm package (peerjs-server). Not possible on GitHub Pages (static host only) — needs a separate runtime host.
- ICE config: defaults include Google STUN only. No TURN → peers behind symmetric NAT or strict corporate firewalls will fail to connect. Acceptable for practice; config is a single `Peer` option.
- Docs: peerjs.com (client API at peerjs.com/client/api/peer; server at peerjs.com/server/getting-started).

## Solid

- Official Vite templates: `solidjs/templates` repo (variants: `ts`, `ts-swc`, …). Also `bun create vite` → `solid-ts`.
- Docs: docs.solidjs.com (quick start, TypeScript config). SPA via plain Vite is the standard for static hosting; SolidStart (SSR meta-framework) is unnecessary on GitHub Pages.

## Tailwind CSS

- Current major: **v4**. Install: `tailwindcss @tailwindcss/vite`. Wire the Vite plugin in `vite.config.ts`. One line in CSS: `@import "tailwindcss";`. No `tailwind.config.js` needed — CSS-first config via `@theme`.
- Source: tailwindcss.com/docs/installation/using-vite.

## Bun

- Current stable line: **1.4.x** (1.4.0 released ~2026-08; 1.4.2 cited as current stable). Local install verified below.
- Roles here: package manager (`bun install`), script runner (`bun run dev` → Vite), CI runtime (`oven-sh/setup-bun` in Actions).

## GitHub Pages deploy

- Repo: `2aiMoliu/peerjs-practice` → project site URL `https://2aimoliu.github.io/peerjs-practice/` → Vite needs `base: "/peerjs-practice/"`.
- Official flow: repo Settings → Pages → Source: **GitHub Actions**. Workflow: checkout → setup-bun → `bun install` → `bun run build` → `actions/configure-pages` + `actions/upload-pages-artifact` → `actions/deploy-pages`.
- Pages serves over HTTPS → secure context → `getUserMedia` (camera/mic) works. Static files only → no server-side runtime in production.

## Verified locally

- `bun --version`: 1.4.4

## Sources

- npmjs.com/package/peerjs · github.com/peers/peerjs/releases · peerjs.com · peerjs.com/client/api/peer · peerjs.com/server/getting-started · status.peerjs.com
- github.com/solidjs/templates · docs.solidjs.com/quick-start
- tailwindcss.com/docs/installation/using-vite · tailwindcss.com/blog/tailwindcss-v4
- blog posts on Bun 1.4 (bun.com/blog) · anthropic.com/news/anthropic-acquires-bun
- vite.dev/guide/static-deploy · docs.github.com/pages
