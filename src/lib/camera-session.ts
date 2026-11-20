import { createSignal, onCleanup } from 'solid-js'
import Peer, { type DataConnection, type MediaConnection } from 'peerjs'
import { makeJoinCode } from './codes'
import { peerOptions } from './peer-config'
import { createFeedTree } from './tree'
import {
  CHAT_HISTORY_LIMIT,
  MAX_CHAT_TEXT,
  parseToCamera,
  type ChatMessage,
  type ToViewer,
} from './protocol'

export type CameraErrorKind = 'denied' | 'access' | 'not-found' | 'conn'

export type CameraStatus =
  | 'requesting-camera' // asking for getUserMedia
  | 'waiting' // camera on, peer up, no Viewer yet
  | 'live' // at least one Viewer watching
  | 'ended'
  | 'error'

interface Line {
  conn: DataConnection
  viewerNumber: number // R5: monotonic, never reused
}

/**
 * Camera role: this device's camera is the source, broadcast to any number
 * of Viewers (PLAN addendum supersedes the 1:1 rule).
 *
 * Two planes:
 * - Control + chat is a star: one DataConnection per Viewer, for the whole
 *   Session. Join, repair, chat and the Viewer count all ride it.
 * - Media is a tree (fanout 4, `tree.ts`): the Camera calls its direct
 *   children; a Relay forwards the Feed it receives. The Camera assigns
 *   every media parent, so it can re-parent orphans when a Relay leaves.
 */
export function createCameraSession() {
  const [status, setStatus] = createSignal<CameraStatus>('requesting-camera')
  const [error, setError] = createSignal<CameraErrorKind | null>(null)
  const [stream, setStream] = createSignal<MediaStream | null>(null)
  const [startedAt, setStartedAt] = createSignal<number | null>(null)
  const [joinCode] = createSignal(makeJoinCode())
  const [watchingCount, setWatchingCount] = createSignal(0)
  const [messages, setMessages] = createSignal<readonly ChatMessage[]>([])

  const chatLog: ChatMessage[] = []
  let nextViewerNumber = 1
  const lines = new Map<string, Line>() // Viewer peer id → control line
  const calls = new Map<string, MediaConnection>() // Camera → direct children
  const tree = createFeedTree(joinCode())

  let peer: Peer | null = null
  let localStream: MediaStream | null = null
  let wakeLock: WakeLockSentinel | null = null
  let disposed = false

  async function start() {
    // Rear camera, fallback to default video on OverconstrainedError (Q7).
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'OverconstrainedError') {
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        } catch {
          fail('access')
          return
        }
      } else if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
        fail('denied')
        return
      } else {
        fail('not-found')
        return
      }
    }
    if (disposed) {
      localStream.getTracks().forEach((t) => t.stop())
      return
    }
    setStream(localStream)
    setStatus('waiting')
    requestWakeLock()

    peer = new Peer(joinCode(), peerOptions)

    // Camera-side reconnect: same id, Join code and QR stay valid.
    peer.on('disconnected', () => {
      if (!disposed && peer && !peer.destroyed) peer.reconnect()
    })

    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') return // not ours to handle
      if (err.type === 'network') {
        setError('conn')
        return
      }
      fail('conn')
    })

    // A Viewer arrived: its control line for the whole Session.
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        if (disposed || !localStream) {
          conn.close()
          return
        }
        if (lines.has(conn.peer)) {
          conn.close() // duplicate line — keep the established one
          return
        }
        const parentId = tree.attach(conn.peer)
        if (parentId === null) {
          sendOn(conn, { type: 'full' }) // defensive (R1); never in normal use
          conn.close()
          return
        }
        const line: Line = { conn, viewerNumber: nextViewerNumber++ }
        lines.set(conn.peer, line)
        sendOn(conn, { type: 'history', messages: [...chatLog] })
        wireParent(conn.peer, parentId, {
          type: 'assign',
          viewerNumber: line.viewerNumber,
          parentId,
        })
        refreshCount()
      })
      conn.on('data', (data) => {
        if (lines.get(conn.peer)?.conn === conn) onData(conn, data)
      })
      conn.on('close', () => {
        if (lines.get(conn.peer)?.conn === conn) leave(conn.peer)
      })
      conn.on('error', () => {
        if (lines.get(conn.peer)?.conn === conn) leave(conn.peer)
      })
    })
  }

  function onData(conn: DataConnection, data: unknown) {
    const msg = parseToCamera(data)
    if (!msg) return
    if (msg.type === 'chat') {
      const line = lines.get(conn.peer)
      if (!line) return
      appendChat({
        from: { role: 'viewer', n: line.viewerNumber },
        text: msg.text.slice(0, MAX_CHAT_TEXT),
        ts: Date.now(),
      })
    } else if (msg.type === 'need-parent') {
      // Media died on this Viewer's side but its control line lives (R3
      // fallback). Move it — its subtree stays attached to it.
      const parentId = tree.move(conn.peer)
      if (parentId === null) return
      wireParent(conn.peer, parentId, { type: 'reassign', parentId })
    }
  }

  /** Tell a Viewer who feeds it, and tell that parent to call it. */
  function wireParent(childId: string, parentId: string, first: ToViewer) {
    const line = lines.get(childId)
    if (!line) return
    sendOn(line.conn, first)
    if (parentId === joinCode()) {
      callDirect(childId)
    } else {
      // The Relay calls the child; if its line just died, its close handler
      // will repair the child, so a failed send here is harmless.
      const relay = lines.get(parentId)
      if (relay) sendOn(relay.conn, { type: 'adopt', childId })
    }
  }

  function callDirect(childId: string) {
    if (!peer || !localStream || disposed) return
    const old = calls.get(childId)
    if (old) {
      calls.delete(childId)
      old.close()
    }
    const call = peer.call(childId, localStream)
    calls.set(childId, call)
    const drop = () => {
      if (calls.get(childId) === call) calls.delete(childId)
    }
    call.on('close', drop)
    call.on('error', drop)
  }

  /** Viewer left: drop its line and call, re-attach its orphaned children. */
  function leave(id: string) {
    const line = lines.get(id)
    if (!line) return
    lines.delete(id)
    try {
      line.conn.close()
    } catch {
      // Already closing.
    }
    const call = calls.get(id)
    if (call) {
      calls.delete(id)
      call.close()
    }
    for (const orphan of tree.remove(id)) placeOrphan(orphan)
    refreshCount()
  }

  /** Re-attach an orphan root (its own subtree moves with it — R3). */
  function placeOrphan(orphanId: string) {
    const parentId = tree.attach(orphanId)
    if (parentId === null) {
      leave(orphanId) // no slot anywhere (unreachable in practice) — cascade
      return
    }
    wireParent(orphanId, parentId, { type: 'reassign', parentId })
  }

  function refreshCount() {
    const n = lines.size
    setWatchingCount(n)
    broadcast({ type: 'count', n })
    if (n > 0) {
      if (status() !== 'live') {
        setStatus('live')
        setStartedAt(Date.now())
      }
    } else if (!disposed && status() === 'live') {
      setStatus('waiting')
      setStartedAt(null)
    }
  }

  function appendChat(message: ChatMessage) {
    chatLog.push(message)
    if (chatLog.length > CHAT_HISTORY_LIMIT) chatLog.shift()
    setMessages([...chatLog])
    broadcast({ type: 'chat', message }) // sender included — one order for all
  }

  function sendOn(conn: DataConnection, msg: ToViewer) {
    if (!conn.open) return
    try {
      conn.send(msg)
    } catch {
      // Line is closing — its close handler cleans up.
    }
  }

  function broadcast(msg: ToViewer) {
    for (const line of lines.values()) sendOn(line.conn, msg)
  }

  /** Camera sends a chat message from the UI. Always succeeds locally —
   *  the log is the source of truth and there is always a Viewer to reach
   *  once the gate (watching > 0) opens. */
  function sendChat(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed) return false
    appendChat({ from: { role: 'camera' }, text: trimmed.slice(0, MAX_CHAT_TEXT), ts: Date.now() })
    return true
  }

  function fail(kind: CameraErrorKind) {
    setError(kind)
    setStatus('error')
    teardown()
  }

  async function requestWakeLock() {
    try {
      wakeLock = await navigator.wakeLock.request('screen')
      wakeLock.addEventListener('release', () => {
        wakeLock = null
      })
    } catch {
      // Wake Lock unsupported — screen may sleep; accepted (Q7 mitigation only).
    }
  }

  function end() {
    setStatus('ended')
    broadcast({ type: 'ended' })
    // Let the 'ended' messages flush before the lines close (best effort).
    window.setTimeout(() => {
      stopSource()
      teardown()
    }, 250)
  }

  function stopSource() {
    localStream?.getTracks().forEach((t) => t.stop())
    localStream = null
    setStream(null)
    wakeLock?.release().catch(() => {})
    wakeLock = null
  }

  function teardown() {
    for (const call of calls.values()) call.close()
    calls.clear()
    for (const line of lines.values()) {
      try {
        line.conn.close()
      } catch {
        // Already closing.
      }
    }
    lines.clear()
    stopSource()
    peer?.destroy()
    peer = null
    setStartedAt(null)
  }

  onCleanup(() => {
    disposed = true
    teardown()
  })

  start()

  return { status, error, stream, startedAt, joinCode, watchingCount, messages, sendChat, end }
}
