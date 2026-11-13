import { createSignal, onCleanup } from 'solid-js'
import Peer, { type DataConnection, type MediaConnection } from 'peerjs'
import { makeJoinCode } from './codes'
import { peerOptions } from './peer-config'

export type CameraErrorKind = 'denied' | 'access' | 'not-found' | 'conn'

export type CameraStatus =
  | 'requesting-camera' // asking for getUserMedia
  | 'waiting' // camera on, peer up, no Viewer yet
  | 'live' // Viewer watching
  | 'ended'
  | 'error'

/**
 * Camera role: this device's camera is the source. One Viewer at a time (Q8).
 * The Join code is this peer's id, so reconnects keep the code valid.
 *
 * Flow: the Viewer opens a data connection to us (a watch request); we then
 * place the media call to the Viewer with the real stream. The Viewer answers
 * receive-only. (The reverse — Viewer calling with an empty stream — cannot
 * work: an offer with no tracks leaves no m-line for the video to ride on.)
 */
export function createCameraSession() {
  const [status, setStatus] = createSignal<CameraStatus>('requesting-camera')
  const [error, setError] = createSignal<CameraErrorKind | null>(null)
  const [stream, setStream] = createSignal<MediaStream | null>(null)
  const [startedAt, setStartedAt] = createSignal<number | null>(null)
  const [joinCode] = createSignal(makeJoinCode())

  let peer: Peer | null = null
  let request: DataConnection | null = null
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

    // Watch request from a Viewer.
    peer.on('connection', (conn) => {
      if (request || call) {
        // Q8: strict 1:1 — a second Viewer is rejected by closing its request.
        conn.on('open', () => conn.close())
        if (!request) conn.close()
        return
      }
      if (!localStream) {
        conn.close()
        return
      }
      request = conn
      conn.on('close', () => {
        if (request === conn) request = null
      })
      // We call the Viewer; its answer is receive-only.
      call = peer!.call(conn.peer, localStream)
      call.on('close', () => {
        call = null
        request?.close()
        request = null
        setStartedAt(null)
        if (!disposed) setStatus('waiting')
      })
      call.on('error', () => {
        call = null
        request?.close()
        request = null
        setStartedAt(null)
        if (!disposed) setStatus('waiting')
      })
      setStartedAt(Date.now())
      setStatus('live')
    })
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
    teardown()
  }

  function teardown() {
    call?.close()
    call = null
    request?.close()
    request = null
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
