import { createEffect, createMemo, createSignal, onMount, Show } from 'solid-js'
import QRCode from 'qrcode'
import { createCameraSession } from '../lib/camera-session'
import { viewerUrl } from '../lib/util'
import { liveDot, useTimecode } from './hud'
import { t, watchingLabel } from '../lib/i18n'
import { ChatFloats, ChatInput } from './ChatOverlay'
import type { CameraErrorKind } from '../lib/camera-session'

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

  const errorText = () => {
    switch (s.error() as CameraErrorKind) {
      case 'denied':
        return t('errDenied')
      case 'access':
        return t('errAccess')
      case 'not-found':
        return t('errNotFound')
      default:
        return t('errFailed')
    }
  }

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
            fallback={<p class="text-fog">{t('askingCamera')}</p>}
          >
            <p class="text-sm text-fog">{t('waitingViewer')}</p>
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
              <p class="text-sm text-fog">{t('scanDesktop')}</p>
            </div>
            <button
              class="rounded border border-line bg-panel px-4 py-2 text-sm text-paper hover:border-fog"
              onClick={copyLink}
            >
              {copied() ? t('linkCopied') : t('copyWatchLink')}
            </button>
            <p class="max-w-xs break-all text-xs text-fog">{link()}</p>
          </Show>
        </div>
      </Show>

      {/* Live HUD — `● LIVE 00:04:12  2 watching  K7MQ2` */}
      <Show when={s.status() === 'live'}>
        <div class="absolute inset-x-0 top-0 flex items-center gap-2 bg-room/60 py-2 pr-4 pl-28 font-hud text-sm backdrop-blur-sm">
          {liveDot()}
          <span class="text-signal">{t('live')}</span>
          <span class="text-paper">{timecode()}</span>
          <span class="text-fog">{watchingLabel(s.watchingCount())}</span>
          <span class="ml-auto tracking-[0.2em] text-fog">{s.joinCode()}</span>
        </div>
      </Show>

      <Show when={s.status() === 'error'}>
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-room/90 px-6 text-center">
          <p class="text-paper">{errorText()}</p>
          <button
            class="rounded border border-line bg-panel px-4 py-2 text-sm text-paper hover:border-fog"
            onClick={() => location.reload()}
          >
            {t('tryAgain')}
          </button>
        </div>
      </Show>

      <Show when={s.status() === 'ended'}>
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-room/90 text-center">
          <p class="text-paper">{t('feedEnded')}</p>
          <a href={`?`} class="text-sm text-fog underline underline-offset-4 hover:text-paper">
            {t('backToStart')}
          </a>
        </div>
      </Show>

      {/* Chat input (always visible) + End feed — bottom bar */}
      <Show when={s.status() === 'live' || s.status() === 'waiting'}>
        <ChatFloats messages={s.messages} my={() => ({ role: 'camera' })} />
        <div class="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 bg-room/60 px-3 py-3 backdrop-blur-sm sm:px-4">
          <ChatInput canSend={() => s.watchingCount() > 0} onSend={s.sendChat} />
          <button
            class="shrink-0 rounded border border-line bg-room/70 px-4 py-2 text-sm text-paper backdrop-blur-sm hover:border-fog"
            onClick={s.end}
          >
            {t('endFeed')}
          </button>
        </div>
      </Show>
    </main>
  )
}

