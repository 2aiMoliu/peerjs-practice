# peerjs-practice

A practice web app that shows a phone's live camera on desktop browsers over direct WebRTC links.

## Language

**Camera**:
The phone-side role. The device that captures its live video and sends it to its Viewers.
_Avoid_: host, sender, broadcaster, peer

**Viewer**:
The desktop-side role. A device that watches one Camera's Feed.
_Avoid_: guest, receiver, watcher, client

**Join code**:
The short code a Camera shows. A Viewer types it, or opens a link that carries it, to reach that Camera.
_Avoid_: room code, peer ID, session ID

**Feed**:
The live video stream from one Camera, as seen by its Viewers. Video only — no audio.
_Avoid_: stream, call, video

**Session**:
One Camera's live period, with any number of Viewers.
_Avoid_: call, room, connection

**Relay**:
A Viewer that also forwards the Feed to up to 4 further Viewers. Assigned by the Camera; mandatory when picked.
_Avoid_: host, node, repeater

**Chat**:
The group text between the Camera and all Viewers during a Session. In memory only.
_Avoid_: messages, DMs, comments

**Watching**:
The number of Viewers currently on a Feed. Shown in both HUDs.
_Avoid_: viewers count (say "Watching"), audience

**Snapshot**:
A still image captured from the Feed at the Viewer side.
_Avoid_: screenshot, photo, capture

**Feed interrupted**:
The state when the Feed stops because the Camera's tab is hidden or the track pauses.
_Avoid_: paused, frozen, lagging

**Camera full**:
The defensive state when the media tree's capacity is reached. Never shown in normal use.
_Avoid_: busy, in use
