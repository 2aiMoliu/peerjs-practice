import type { PeerOptions } from 'peerjs'

/**
 * Q4: PeerJS Cloud signaling + ICE, isolated here for a one-edit swap
 * (self-hosted PeerServer or different cloud settings).
 */
export const peerOptions: PeerOptions = {
  // Cloud defaults are used when `config` is omitted; kept explicit so the
  // ICE setup is visible and editable in one place.
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
    sdpSemantics: 'unified-plan',
  },
}
