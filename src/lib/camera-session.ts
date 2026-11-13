import { createSignal, onCleanup } from 'solid-js'
import Peer, { type MediaConnection } from 'peerjs'
import { makeJoinCode } from './codes'
import { peerOptions } from './peer-config'

export type CameraStatus =
  | 'requesting-camera' // asking for getUserMedia
  | 'waiting' // camera on, peer up, no Viewer yet
  | 'live' // Viewer watching
  | 'ended'
  | 'error'

/**
 * Camera role: this device's camera is the source. One Viewer at a time (Q8).
 * The Join code is this peer's id, so reconnects keep the code valid.
 */
export function createCameraSession() {
  const [status, setStatus] = createSignal<CameraStatus>('requesting-camera')
  const [error, setError] = createSignal<string | null>(null)
  const [stream, setStream] = createSignal<MediaStream | null>(null)
  const [startedAt, setStartedAt] = createSignal<number | null>(null)
  const [joinCode] = createSignal(makeJoinCode())

  let peer: Peer | null = null
  let call: MediaConnection | null = null
  let localStream: MediaStream | null = null
  let wakeLock: WakeLockSentinel | null = null
  let disposed = false

  async function start() {
    // Q7: rear camera, fallback to default video on OverconstrainedError.
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
          fail('Camera access failed. Check browser permissions and try again.')
          return
        }
      } else if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
        fail('Camera permission denied. Allow camera access in the browser, then try again.')
        return
      } else {
        fail('No camera found on this device.')
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
        setError('Lost the signaling server. Retrying…')
        return
      }
      fail(`Connection error (${err.type}). Try again.`)
    })

    peer.on('call', (incoming) => {
      if (call && !call.open) {
        // Session ended moments ago; still treat as busy until cleanup finishes.
        incoming.close()
        return
      }
      if (call) {
        // Q8: strict 1:1 — a second Viewer gets rejected by closing the call.
        incoming.close()
        return
      }
      if (!localStream) {
        incoming.close()
        return
      }
      call = incoming
      // Q7: auto-accept the first Viewer with the real stream.
      incoming.answer(localStream)
      setStartedAt(Date.now())
      setStatus('live')
      incoming.on('close', () => {
        call = null
        setStartedAt(null)
        if (!disposed) setStatus('waiting')
      })
    })
  }

  function fail(message: string) {
    setError(message)
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
    teardown()
  }

  function teardown() {
    call?.close()
    call = null
    localStream?.getTracks().forEach((t) => t.stop())
    localStream = null
    setStream(null)
    setStartedAt(null)
    wakeLock?.release().catch(() => {})
    wakeLock = null
    peer?.destroy()
    peer = null
  }

  onCleanup(() => {
    disposed = true
    teardown()
  })

  start()

  return { status, error, stream, startedAt, joinCode, end }
}
