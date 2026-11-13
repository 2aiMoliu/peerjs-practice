# peerjs-practice

A practice web app that shows a phone's live camera on a desktop browser over a direct WebRTC link.

## Language

**Camera**:
The phone-side role. The device that captures its live video and sends it to one Viewer.
_Avoid_: host, sender, broadcaster, peer

**Viewer**:
The desktop-side role. The device that watches one Camera's feed.
_Avoid_: guest, receiver, watcher, client

**Join code**:
The short code a Camera shows. A Viewer types it, or opens a link that carries it, to reach that Camera.
_Avoid_: room code, peer ID, session ID

**Feed**:
The live video stream from one Camera, as seen by its Viewer. Video only — no audio.
_Avoid_: stream, call, video

**Session**:
The live pairing of one Camera with one Viewer, one at a time.
_Avoid_: call, room, connection

**Snapshot**:
A still image captured from the Feed at the Viewer side.
_Avoid_: screenshot, photo, capture

**Feed interrupted**:
The state when the Feed stops because the Camera's tab is hidden or the track pauses.
_Avoid_: paused, frozen, lagging
