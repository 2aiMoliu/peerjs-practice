import { createEffect, createMemo, createSignal, onMount, Show } from 'solid-js'
import QRCode from 'qrcode'
import { createCameraSession } from '../lib/camera-session'
import { viewerUrl } from '../lib/util'
import { liveDot, useTimecode } from './hud'

export function CameraView() {
  const s = createCameraSession()
  const timecode = useTimecode(s.startedAt)
  const [copied, setCopied] = createSignal(false)
  const [qr, setQr] = createSignal('')

  onMount(() => {
    QRCode.toDataURL(viewerUrl(s.joinCode()), {
      margin: 1,
      width: 192,
      color: { dark: '#E8ECE9', light: '#101312' },
    })
      .then(setQr)
      .catch(() => {})
  })

  let videoEl!: HTMLVideoElement
  const attach = (el: HTMLVideoElement) => {
    videoEl = el
    // Set srcObject once stream arrives.
    createEffect(() => {
      videoEl.srcObject = s.stream()
    })
  }

  const link = createMemo(() => viewerUrl(s.joinCode()))

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked — the link stays visible for manual copy.
    }
  }

  return (
    <main class="relative h-full overflow-hidden bg-black">
      <Show when={s.stream()}>
        <video
          ref={attach}
          class="h-full w-full object-cover"
          muted
          playsinline
          autoplay
        />
      </Show>

      {/* Waiting overlay: the code moment — center allowed only here */}
      <Show when={s.status() === 'waiting' || s.status() === 'requesting-camera'}>
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-room/80 px-6 text-center">
          <Show
            when={s.status() === 'waiting'}
            fallback={<p class="text-fog">Asking for camera access…</p>}
          >
            <p class="text-sm text-fog">Waiting for a viewer</p>
            <p class="font-hud text-4xl font-medium tracking-[0.3em] text-paper">
              {s.joinCode()}
            </p>
            <div class="flex flex-col items-center gap-2">
              <img
                src={qr()}
                alt="QR code that opens the watch screen with this code"
                class="size-40 rounded border border-line"
                width="192"
                height="192"
              />
              <p class="text-sm text-fog">scan on the desktop</p>
            </div>
            <button
              class="rounded border border-line bg-panel px-4 py-2 text-sm text-paper hover:border-fog"
              onClick={copyLink}
            >
              {copied() ? 'Link copied' : 'Copy watch link'}
            </button>
            <p class="max-w-xs break-all text-xs text-fog">{link()}</p>
          </Show>
        </div>
      </Show>

      {/* Live HUD */}
      <Show when={s.status() === 'live'}>
        <div class="absolute inset-x-0 top-0 flex items-center gap-2 bg-room/60 px-4 py-2 font-hud text-sm backdrop-blur-sm">
          {liveDot()}
          <span class="text-signal">LIVE</span>
          <span class="text-paper">{timecode()}</span>
          <span class="ml-auto tracking-[0.2em] text-fog">{s.joinCode()}</span>
        </div>
      </Show>

      <Show when={s.status() === 'error'}>
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-room/90 px-6 text-center">
          <p class="text-paper">{s.error()}</p>
          <button
            class="rounded border border-line bg-panel px-4 py-2 text-sm text-paper hover:border-fog"
            onClick={() => location.reload()}
          >
            Try again
          </button>
        </div>
      </Show>

      <Show when={s.status() === 'ended'}>
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-room/90 text-center">
          <p class="text-paper">Feed ended</p>
          <a href={`?`} class="text-sm text-fog underline underline-offset-4 hover:text-paper">
            Back to start
          </a>
        </div>
      </Show>

      {/* End feed — bottom-right, quiet */}
      <Show when={s.status() === 'live' || s.status() === 'waiting'}>
        <button
          class="absolute right-4 bottom-4 rounded border border-line bg-room/70 px-4 py-2 text-sm text-paper backdrop-blur-sm hover:border-fog"
          onClick={s.end}
        >
          End feed
        </button>
      </Show>
    </main>
  )
}

