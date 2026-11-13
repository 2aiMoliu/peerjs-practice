import { createSignal, onCleanup } from 'solid-js'
import Peer, { PeerErrorType, type DataConnection, type MediaConnection } from 'peerjs'
import { peerOptions } from './peer-config'

export type ViewerStatus =
  | 'connecting' // requesting the feed, no media yet
  | 'live' // feed on screen
  | 'reconnecting' // feed dropped, retrying (Q6 auto-reconnect)
  | 'ended'
  | 'error'

export type ViewerErrorKind = 'no-camera' | 'busy' | 'network' | 'failed'

const BUSY_TIMEOUT_MS = 5_000
const RETRY_DELAYS = [1_000, 2_000, 4_000]

/**
 * Viewer role: watch a Camera's feed by Join code.
 *
 * Flow: we open a data connection to the Camera (watch request); the Camera
 * then calls us with the real stream and we answer receive-only. Media flows
 * Camera → Viewer. (An offer with no tracks cannot carry the video — see
 * camera-session.ts.)
 */
export function createViewerSession(code: string) {
  const [status, setStatus] = createSignal<ViewerStatus>('connecting')
  const [error, setError] = createSignal<ViewerErrorKind | null>(null)
  const [stream, setStream] = createSignal<MediaStream | null>(null)
  const [startedAt, setStartedAt] = createSignal<number | null>(null)
  const [interrupted, setInterrupted] = createSignal(false)

  let peer: Peer | null = null
  let request: DataConnection | null = null
  let call: MediaConnection | null = null
  let hadMedia = false
  let retryCount = 0
  let busyTimer: number | undefined
  let retryTimer: number | undefined
  let disposed = false
  let userEnded = false

  function start() {
    if (disposed) return
    userEnded = false
    setError(null)
    setStatus('connecting')

    if (!peer || peer.destroyed) {
      peer = new Peer(peerOptions)
      peer.on('error', (err) => {
        if (disposed || !peer) return
        if (err.type === 'network') {
          setError('network')
          setStatus('error')
          return
        }
        if (err.type === PeerErrorType.PeerUnavailable) {
          // Signaling server says no peer with that id.
          setError('no-camera')
          setStatus('error')
          cleanupPeer()
          return
        }
        setError('failed')
        setStatus('error')
      })
      peer.on('open', dial)
      // Registered once per peer, not per dial attempt.
      peer.on('call', onCall)
      // If already open (recreated peer), the 'open' handler above runs.
    } else if (peer.open) {
      dial()
    }
  }

  function dial() {
    if (disposed || !peer) return
    hadMedia = false
    request = peer.connect(code)

    request.on('open', () => {
      // Watch request delivered. The Camera will call us with the stream.
    })

    // Request closed before any media → the Camera rejected us (Q8) or died.
    request.on('close', () => {
      request = null
      if (disposed || userEnded || hadMedia) return
      clearTimeout(busyTimer)
      setError('busy')
      setStatus('error')
      cleanupPeer()
    })

    // No media within the timeout → busy or dead path; treat as busy only if
    // the request itself closed, else network failure.
    busyTimer = window.setTimeout(() => {
      if (!hadMedia && !disposed) {
        setError('network')
        setStatus('error')
        cleanupPeer()
      }
    }, BUSY_TIMEOUT_MS)
  }

  // The Camera calls us; answer receive-only.
  function onCall(incoming: MediaConnection) {
    if (call) {
      incoming.close()
      return
    }
    call = incoming
    incoming.answer()
    incoming.on('stream', (remote) => {
      hadMedia = true
      clearTimeout(busyTimer)
      retryCount = 0
      setStream(remote)
      setStartedAt(Date.now())
      setInterrupted(false)
      setStatus('live')

      // Q7: track mute/unmute = Feed interrupted / live (covers tab-hide).
      const [track] = remote.getVideoTracks()
      if (track) {
        track.onmute = () => setInterrupted(true)
        track.onunmute = () => setInterrupted(false)
      }
    })

    // Unexpected close after media → auto-reconnect (Q6), 3 attempts.
    incoming.on('close', () => {
      call = null
      request?.close()
      request = null
      if (disposed || userEnded || !hadMedia) return
      if (retryCount < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[retryCount++]!
        setStatus('reconnecting')
        retryTimer = window.setTimeout(() => {
          if (!disposed) start()
        }, delay)
      } else {
        setError('network')
        setStatus('error')
      }
    })
  }

  function end() {
    userEnded = true
    setStatus('ended')
    teardown()
  }

  function cleanupPeer() {
    clearTimeout(retryTimer)
    clearTimeout(busyTimer)
    call?.close()
    call = null
    request?.close()
    request = null
    peer?.destroy()
    peer = null
  }

  function teardown() {
    cleanupPeer()
    setStream(null)
    setStartedAt(null)
    setInterrupted(false)
  }

  onCleanup(() => {
    disposed = true
    teardown()
  })

  start()

  return { status, error, stream, startedAt, interrupted, end }
}
