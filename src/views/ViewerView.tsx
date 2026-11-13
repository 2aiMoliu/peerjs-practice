import { createEffect, createMemo, createSignal, Show } from 'solid-js'
import QRCode from 'qrcode'
import { isCompleteCode, normalizeJoinCode } from '../lib/codes'
import { createViewerSession } from '../lib/viewer-session'
import { cameraUrl } from '../lib/util'
import { liveDot, useTimecode } from './hud'
import { t } from '../lib/i18n'

export function ViewerView(props: { initialCode?: string }) {
  const [code, setCode] = createSignal(normalizeJoinCode(props.initialCode ?? ''))
  const [session, setSession] = createSignal<ReturnType<typeof createViewerSession> | null>(null)

  const watch = () => {
    if (isCompleteCode(code())) setSession(createViewerSession(code()))
  }

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault()
    watch()
  }

  return (
    <Show when={session()} fallback={<StartScreen code={code} setCode={setCode} onSubmit={handleSubmit} />}>
      {(s) => <WatchScreen session={s()} code={code()} onLeave={() => { s().end(); setSession(null); setCode('') }} />}
    </Show>
  )
}

function StartScreen(props: {
  code: () => string
  setCode: (v: string) => void
  onSubmit: (e: SubmitEvent) => void
}) {
  const [qr, setQr] = createSignal('')
  const [copied, setCopied] = createSignal(false)

  QRCode.toDataURL(cameraUrl(), { margin: 1, width: 192, color: { dark: '#E8ECE9', light: '#101312' } })
    .then(setQr)
    .catch(() => {})

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(cameraUrl())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked — camera URL shown below.
    }
  }

  return (
    <main class="flex h-full flex-col justify-center gap-8 px-5 py-8 sm:mx-auto sm:max-w-2xl sm:px-6">
      <h1 class="text-2xl font-semibold tracking-tight text-paper">{t('watchFeed')}</h1>

      <div class="grid items-start gap-8 sm:grid-cols-[1fr_auto]">
        <form onSubmit={props.onSubmit} class="flex flex-col gap-4">
          <label for="code" class="text-sm text-fog">
            {t('enterCode')}
          </label>
          <input
            id="code"
            inputMode="text"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck={false}
            class="w-full rounded border border-line bg-panel px-4 py-3 font-hud text-2xl tracking-[0.3em] text-paper uppercase placeholder:text-fog/50 focus:border-fog"
            placeholder="——————"
            value={props.code()}
            onInput={(e) => props.setCode(normalizeJoinCode(e.currentTarget.value))}
            maxlength={6}
          />
          <button
            type="submit"
            disabled={!isCompleteCode(props.code())}
            class="rounded bg-paper px-4 py-3 font-medium text-room transition-opacity disabled:opacity-30"
          >
            {t('watch')}
          </button>
          <Show when={props.code() && !isCompleteCode(props.code())}>
            <p class="text-sm text-fog">{t('codeLen')}</p>
          </Show>
        </form>

        <div class="flex flex-col items-center gap-2">
          <img
            src={qr()}
            alt="QR code that opens this app in camera mode"
            class="size-48 rounded border border-line"
            width="192"
            height="192"
          />
          <p class="text-sm text-fog">{t('scanPhone')}</p>
          <button class="text-sm text-fog underline underline-offset-4 hover:text-paper" onClick={copyLink}>
            {copied() ? t('copied') : t('copyLink')}
          </button>
        </div>
      </div>
    </main>
  )
}

function WatchScreen(props: {
  session: ReturnType<typeof createViewerSession>
  code: string
  onLeave: () => void
}) {
  const s = props.session
  const timecode = useTimecode(s.startedAt)

  let videoEl!: HTMLVideoElement
  const attach = (el: HTMLVideoElement) => {
    videoEl = el
    createEffect(() => {
      videoEl.srcObject = s.stream()
    })
  }

  const errorText = createMemo(() => {
    switch (s.error()) {
      case 'no-camera':
        return t('errNoCamera')
      case 'busy':
        return t('errBusy')
      case 'network':
        return t('errNetwork')
      default:
        return t('errFailed')
    }
  })

  function snapshot() {
    if (!videoEl.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = videoEl.videoWidth
    canvas.height = videoEl.videoHeight
    canvas.getContext('2d')!.drawImage(videoEl, 0, 0)
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    const now = new Date()
    const hhmmss = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((n) => String(n).padStart(2, '0'))
      .join('')
    a.download = `snapshot-${props.code}-${hhmmss}.png`
    a.click()
  }

  return (
    <main class="relative h-full overflow-hidden bg-black">
      <Show when={s.stream()}>
        <video ref={attach} class="h-full w-full object-contain" muted playsinline autoplay />
      </Show>

      {/* Live: viewfinder brackets — the one bold element */}
      <Show when={s.status() === 'live' || s.status() === 'reconnecting'}>
        <div class="pointer-events-none absolute inset-3 sm:inset-6" aria-hidden="true">
          <div class="absolute top-0 left-0 h-6 w-6 border-t-2 border-l-2 border-paper" />
          <div class="absolute top-0 right-0 h-6 w-6 border-t-2 border-r-2 border-paper" />
          <div class="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-paper" />
          <div class="absolute right-0 bottom-0 h-6 w-6 border-r-2 border-b-2 border-paper" />
        </div>

        <div class="absolute inset-x-0 top-0 flex items-center gap-2 bg-room/60 py-2 pr-4 pl-28 font-hud text-sm backdrop-blur-sm">
          <Show when={!s.interrupted()} fallback={<span class="text-caution">{t('feedInterrupted')}</span>}>
            {liveDot()}
            <span class="text-signal">{t('live')}</span>
          </Show>
          <span class="tracking-[0.2em] text-paper">{props.code}</span>
          <span class="ml-auto text-paper">{timecode()}</span>
        </div>

        <Show when={s.status() === 'reconnecting'}>
          <div class="absolute inset-0 flex items-center justify-center bg-room/60">
            <p class="font-hud text-sm text-paper">{t('reconnecting')}</p>
          </div>
        </Show>

        <div class="absolute inset-x-0 bottom-0 flex justify-center gap-3 bg-room/60 px-4 py-3 backdrop-blur-sm">
          <button
            class="rounded border border-line bg-panel px-4 py-2 text-sm text-paper hover:border-fog"
            onClick={snapshot}
          >
            {t('snapshot')}
          </button>
          <button
            class="rounded border border-signal/60 bg-room/70 px-4 py-2 text-sm text-paper hover:border-signal"
            onClick={props.onLeave}
          >
            {t('end')}
          </button>
        </div>
      </Show>

      {/* Connecting / error states */}
      <Show when={s.status() === 'connecting'}>
        <div class="absolute inset-0 flex items-center justify-center bg-room/80">
          <p class="font-hud text-sm text-paper">{t('connecting')}</p>
        </div>
      </Show>

      <Show when={s.status() === 'error' || s.status() === 'ended'}>
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-room/90 px-6 text-center">
          <p class="text-paper">
            {s.status() === 'ended' ? t('feedEnded') : errorText()}
          </p>
          <div class="flex gap-3">
            <button
              class="rounded border border-line bg-panel px-4 py-2 text-sm text-paper hover:border-fog"
              onClick={props.onLeave}
            >
              {t('tryAgain')}
            </button>
            <a
              href={`?`}
              class="rounded border border-line bg-room/70 px-4 py-2 text-sm text-fog hover:text-paper"
            >
              {t('backToStart')}
            </a>
          </div>
        </div>
      </Show>
    </main>
  )
}
