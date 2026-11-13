/** Timecode as hh:mm:ss for the live HUD. */
export function formatElapsed(startedAt: number | null): string {
  if (startedAt === null) return '00:00:00'
  const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/** The URL that opens this app in camera mode on another device. */
export function cameraUrl(): string {
  return `${location.origin}${import.meta.env.BASE_URL}?mode=camera`
}

/** The URL that opens the viewer side with a code prefilled. */
export function viewerUrl(code: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}?mode=view&code=${code}`
}
