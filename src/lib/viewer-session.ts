import { createSignal, onCleanup } from 'solid-js'
import Peer, { PeerErrorType, type MediaConnection } from 'peerjs'
import { peerOptions } from './peer-config'

export type ViewerStatus =
  | 'connecting' // calling the Camera, no media yet
  | 'live' // feed on screen
  | 'reconnecting' // feed dropped, retrying (Q6 auto-reconnect)
  | 'ended'
  | 'error'

export type ViewerErrorKind = 'no-camera' | 'busy' | 'network' | 'failed'

const BUSY_TIMEOUT_MS = 2_000
const RETRY_DELAYS = [1_000, 2_000, 4_000]

/**
 * Viewer role: watch a Camera's feed by Join code.
 * Video flows Camera → Viewer; we `call` with an empty stream and the Camera
 * answers with the real one (see PLAN.md protocol decisions).
 */
export function createViewerSession(code: string) {
  const [status, setStatus] = createSignal<ViewerStatus>('connecting')
  const [error, setError] = createSignal<ViewerErrorKind | null>(null)
  const [stream, setStream] = createSignal<MediaStream | null>(null)
  const [startedAt, setStartedAt] = createSignal<number | null>(null)
  const [interrupted, setInterrupted] = createSignal(false)

  let peer: Peer | null = null
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
      // If already open (recreated peer), the 'open' handler above runs.
    } else if (peer.open) {
      dial()
    }
  }

  function dial() {
    if (disposed || !peer) return
    // Empty outbound stream is legal; the Camera answers with the real feed.
    call = peer.call(code, new MediaStream())

    // No media within the timeout → the Camera is busy with another Viewer.
    busyTimer = window.setTimeout(() => {
      if (!hadMedia && call) {
        setError('busy')
        setStatus('error')
        call.close()
        call = null
      }
    }, BUSY_TIMEOUT_MS)

    call.on('stream', (remote) => {
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

    call.on('close', () => {
      clearTimeout(busyTimer)
      call = null
      if (disposed || userEnded) return
      if (!hadMedia) return // busy path handled by the timeout
      // Unexpected close after media → auto-reconnect (Q6), 3 attempts.
      if (retryCount < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[retryCount++]!
        setStatus('reconnecting')
        retryTimer = window.setTimeout(() => {
          if (!disposed) dial()
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
