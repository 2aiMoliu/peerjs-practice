import { createSignal, onCleanup } from 'solid-js'
import Peer, { PeerErrorType, type DataConnection, type MediaConnection } from 'peerjs'
import { peerOptions } from './peer-config'
import { MAX_CHAT_TEXT, parseToViewer, type ChatMessage } from './protocol'

export type ViewerStatus =
  | 'connecting' // control line up, waiting for assign + media
  | 'live' // feed on screen
  | 'reconnecting' // control line died, re-joining (fallback)
  | 'ended'
  | 'error'

export type ViewerErrorKind = 'no-camera' | 'full' | 'network' | 'failed'

// No media within this after assign → failed (defensive; old busy heuristic
// is gone — the Camera answers with explicit control messages).
const JOIN_MEDIA_TIMEOUT_MS = 8_000
// Reassign received but no new media yet → ask again.
const PARENT_MEDIA_TIMEOUT_MS = 6_000
// need-parent fallback: send immediately, then back off (R3 fallback).
const NP_DELAYS = [0, 2_000, 4_000]
// Control line lost: full re-join with a fresh peer id (old dial-retry rule).
const REJOIN_DELAYS = [1_000, 2_000, 4_000]

/**
 * Viewer role: watch a Camera's feed by Join code, and — when the Camera
 * says so — relay that feed to up to 4 further Viewers (R2, mandatory).
 *
 * One peer instance serves both planes: the control line to the Camera
 * (control messages + chat) and media calls. The Camera assigns the media
 * parent (`assign`/`reassign`); only that peer's calls are answered.
 */
export function createViewerSession(code: string) {
  const [status, setStatus] = createSignal<ViewerStatus>('connecting')
  const [error, setError] = createSignal<ViewerErrorKind | null>(null)
  const [stream, setStream] = createSignal<MediaStream | null>(null)
  const [startedAt, setStartedAt] = createSignal<number | null>(null)
  const [interrupted, setInterrupted] = createSignal(false)
  const [viewerNumber, setViewerNumber] = createSignal<number | null>(null)
  const [watchingCount, setWatchingCount] = createSignal(0)
  const [messages, setMessages] = createSignal<readonly ChatMessage[]>([])
  // False until the Camera's history replay lands: the unread dot must not
  // count messages that predate this Viewer (R4 vs Q6).
  const [chatHydrated, setChatHydrated] = createSignal(false)

  let peer: Peer | null = null
  let control: DataConnection | null = null
  let incoming: MediaConnection | null = null
  let expectedParent: string | null = null
  let sourceStream: MediaStream | null = null
  const childCalls = new Map<string, MediaConnection>() // we are the Relay
  const pendingChildren = new Set<string>() // adopted before media arrived
  let hadMedia = false
  let userEnded = false
  let disposed = false
  let joinTimer: number | undefined
  let parentMediaTimer: number | undefined
  let npTimer: number | undefined
  let npAttempts = 0
  let rejoinTimer: number | undefined
  let rejoinAttempts = 0

  function start() {
    if (disposed || userEnded) return
    setError(null)
    setStatus('connecting')
    armJoinGuard()
    if (!peer || peer.destroyed) {
      peer = new Peer(peerOptions)
      peer.on('error', onPeerError)
      peer.on('call', onCall)
      peer.on('open', dial)
    } else if (peer.open) {
      dial()
    }
  }

  function onPeerError(err: Error & { type?: string }) {
    if (disposed || !peer) return
    if (err.type === PeerErrorType.PeerUnavailable) {
      setError('no-camera')
      setStatus('error')
      cleanup()
      return
    }
    if (err.type === 'network') {
      setError('network')
      setStatus('error')
      cleanup()
      return
    }
    setError('failed')
    setStatus('error')
    cleanup()
  }

  /** No media within 8 s of dial or assign → failed (defensive; replaces
   *  the old close-timing heuristic — also covers a line that never opens). */
  function armJoinGuard() {
    clearTimeout(joinTimer)
    joinTimer = window.setTimeout(() => {
      if (!hadMedia && !disposed && !userEnded) {
        setError('failed')
        setStatus('error')
        cleanup()
      }
    }, JOIN_MEDIA_TIMEOUT_MS)
  }

  function dial() {
    if (disposed || userEnded || !peer) return
    const conn = peer.connect(code)
    control = conn
    conn.on('data', (data) => {
      if (control === conn) onControlData(data)
    })
    conn.on('close', () => {
      if (control !== conn) return
      control = null
      if (disposed || userEnded) return
      rejoin()
    })
  }

  function onControlData(data: unknown) {
    const msg = parseToViewer(data)
    if (!msg) return
    switch (msg.type) {
      case 'assign': {
        setViewerNumber(msg.viewerNumber)
        expectedParent = msg.parentId
        rejoinAttempts = 0
        // Fresh 8 s from assign: media must follow (defensive guard).
        if (!hadMedia) armJoinGuard()
        break
      }
      case 'reassign': {
        // Repair: media parent changed. Drop the old call silently and wait
        // for the new parent to call us; children heal via replaceTrack.
        expectedParent = msg.parentId
        npAttempts = 0
        if (incoming) {
          const old = incoming
          incoming = null
          old.close() // stale close is ignored in onCallClosed
        }
        if (hadMedia) {
          setInterrupted(true)
          clearTimeout(parentMediaTimer)
          parentMediaTimer = window.setTimeout(() => {
            if (!incoming) needParent()
          }, PARENT_MEDIA_TIMEOUT_MS)
        }
        break
      }
      case 'adopt':
        dialChild(msg.childId)
        break
      case 'history':
        setMessages(msg.messages)
        setChatHydrated(true)
        break
      case 'chat':
        setMessages((m) => [...m, msg.message])
        break
      case 'count':
        setWatchingCount(msg.n)
        break
      case 'ended':
        userEnded = true // camera-side end is not an error path
        setStatus('ended')
        teardown()
        break
      case 'full':
        setError('full')
        setStatus('error')
        cleanup()
        break
    }
  }

  // The assigned parent calls us; answer receive-only.
  function onCall(call: MediaConnection) {
    const fromExpected = call.peer === expectedParent
    // Assign may still be in flight (data and media race on first join):
    // with no parent and no call yet, the only possible caller is ours.
    const initialBlind = expectedParent === null && !incoming && !hadMedia
    if (!fromExpected && !initialBlind) {
      call.close()
      return
    }
    if (incoming && incoming !== call) {
      const old = incoming
      incoming = null
      old.close()
    }
    incoming = call
    call.answer()
    call.on('stream', onSourceStream)
    call.on('close', () => onCallClosed(call))
    call.on('error', () => onCallClosed(call))
  }

  function onCallClosed(call: MediaConnection) {
    if (incoming !== call) return // stale or replaced — not a failure
    incoming = null
    if (disposed || userEnded || !hadMedia) return
    setInterrupted(true)
    needParent() // R3 fallback: control line still lives
  }

  function onSourceStream(remote: MediaStream) {
    const newTrack = remote.getVideoTracks()[0] ?? null
    const oldTrack = sourceStream?.getVideoTracks()[0] ?? null
    hadMedia = true
    npAttempts = 0
    rejoinAttempts = 0
    clearTimeout(joinTimer)
    clearTimeout(parentMediaTimer)
    sourceStream = remote
    setStream(remote)
    setStartedAt((t) => t ?? Date.now())
    setInterrupted(false)
    setStatus('live')

    // Feed interrupted detection (Q7): covers the Camera hiding its tab.
    if (newTrack) {
      newTrack.onmute = () => setInterrupted(true)
      newTrack.onunmute = () => setInterrupted(false)
    }

    // Relay duties: feed children adopted while we had no media, and swap
    // the outgoing track for children fed from the previous source (R3).
    dialPending()
    if (oldTrack && newTrack && oldTrack !== newTrack) replaceSource(newTrack)
  }

  // ── Relay side (R2) ─────────────────────────────────────────────────────

  function dialChild(childId: string) {
    if (childCalls.has(childId)) return
    if (!peer || !sourceStream) {
      pendingChildren.add(childId) // the Camera calls us first, then we call
      return
    }
    const call = peer.call(childId, sourceStream)
    childCalls.set(childId, call)
    const drop = () => {
      if (childCalls.get(childId) === call) childCalls.delete(childId)
    }
    call.on('close', drop)
    call.on('error', drop)
  }

  function dialPending() {
    if (!sourceStream) return
    for (const childId of [...pendingChildren]) {
      pendingChildren.delete(childId)
      dialChild(childId)
    }
  }

  function replaceSource(newTrack: MediaStreamTrack) {
    for (const [childId, call] of [...childCalls]) {
      const sender = call.peerConnection.getSenders().find((s) => s.track?.kind === 'video')
      if (!sender) {
        redialChild(childId)
        continue
      }
      sender.replaceTrack(newTrack).catch(() => redialChild(childId))
    }
  }

  function redialChild(childId: string) {
    const old = childCalls.get(childId)
    if (old) {
      childCalls.delete(childId)
      old.close()
    }
    dialChild(childId)
  }

  // ── Repair fallback (R3) ────────────────────────────────────────────────

  function needParent() {
    if (disposed || userEnded) return
    if (!control || !control.open) return // rejoin path owns recovery
    if (npAttempts >= NP_DELAYS.length) {
      setError('network')
      setStatus('error')
      cleanup()
      return
    }
    const delay = NP_DELAYS[npAttempts++]!
    clearTimeout(npTimer)
    npTimer = window.setTimeout(() => {
      if (disposed || userEnded) return
      if (incoming && incoming.open) {
        npAttempts = 0
        return
      }
      if (!control || !control.open) return
      try {
        control.send({ type: 'need-parent' })
      } catch {
        return
      }
      clearTimeout(parentMediaTimer)
      parentMediaTimer = window.setTimeout(() => {
        if (!incoming || !incoming.open) needParent()
      }, PARENT_MEDIA_TIMEOUT_MS)
    }, delay)
  }

  function rejoin() {
    if (rejoinAttempts >= REJOIN_DELAYS.length) {
      setError('network')
      setStatus('error')
      cleanup()
      return
    }
    const delay = REJOIN_DELAYS[rejoinAttempts++]!
    setStatus('reconnecting')
    cleanup() // destroys the peer: our children need-parent to the Camera
    rejoinTimer = window.setTimeout(() => {
      if (!disposed && !userEnded) {
        hadMedia = false
        start()
      }
    }, delay)
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /** Returns false when the line is down, so the UI can keep the text. */
  function sendChat(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed || !control || !control.open) return false
    try {
      control.send({ type: 'chat', text: trimmed.slice(0, MAX_CHAT_TEXT) })
    } catch {
      return false
    }
    return true
  }

  function end() {
    userEnded = true
    setStatus('ended')
    teardown()
  }

  function clearTimers() {
    clearTimeout(joinTimer)
    clearTimeout(parentMediaTimer)
    clearTimeout(npTimer)
    clearTimeout(rejoinTimer)
  }

  function closeMedia() {
    if (incoming) {
      const c = incoming
      incoming = null
      c.close()
    }
    for (const c of childCalls.values()) c.close()
    childCalls.clear()
    pendingChildren.clear()
    sourceStream = null
    setStream(null)
  }

  function cleanup() {
    clearTimers()
    closeMedia()
    expectedParent = null
    if (control) {
      const c = control
      control = null
      c.close()
    }
    peer?.destroy()
    peer = null
  }

  function teardown() {
    cleanup()
    setStartedAt(null)
    setInterrupted(false)
  }

  onCleanup(() => {
    disposed = true
    teardown()
  })

  start()

  return {
    status,
    error,
    stream,
    startedAt,
    interrupted,
    viewerNumber,
    watchingCount,
    messages,
    chatHydrated,
    sendChat,
    end,
  }
}
