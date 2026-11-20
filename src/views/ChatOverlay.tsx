import { createEffect, createSignal, For, on, onCleanup, type JSX } from 'solid-js'
import { MAX_CHAT_TEXT, type ChatMessage, type SenderLabel } from '../lib/protocol'
import { cameraName, t, viewerName, youLabel } from '../lib/i18n'

/** Sender name, localized on this device; own messages read as "You". */
function nameFor(from: SenderLabel, my: SenderLabel | null): string {
  if (my) {
    if (from.role === 'camera' && my.role === 'camera') return youLabel()
    if (from.role === 'viewer' && my.role === 'viewer' && from.n === my.n) {
      return youLabel()
    }
  }
  return from.role === 'camera' ? cameraName() : viewerName(from.n)
}

const FLOAT_TTL_MS = 30_000
// Burst guard: the 30 s floor holds unless ≥8 messages land inside one
// 30 s window; then the oldest yields first.
const MAX_FLOATS = 8

interface FloatItem {
  id: number
  from: SenderLabel
  text: string
}

/**
 * Chat floats (Q6 revised): every Chat arrival surfaces as a transient
 * bubble over the Feed, bottom-left above the input, newest at the bottom,
 * staying ≥30 s before it fades (max 8 shown). Own messages float too — the
 * sender is included in the one broadcast order.
 *
 * `epoch` marks each history replay (first join and repair re-join). Its
 * effect is registered before the arrival effect, so within one batch the
 * float cursor resyncs first and replays never float.
 */
export function ChatFloats(props: {
  messages: () => readonly ChatMessage[]
  my: () => SenderLabel | null
  epoch?: () => number
}): JSX.Element {
  const [items, setItems] = createSignal<FloatItem[]>([])
  // -1 = await the first replay sync (Viewer); 0 = log starts empty (Camera).
  let seen = props.epoch ? -1 : 0
  let nextId = 0
  const timers = new Set<number>()

  if (props.epoch) {
    createEffect(
      on(props.epoch, () => {
        seen = props.messages().length
      }, { defer: true }),
    )
  }

  createEffect(
    on(
      () => props.messages().length,
      () => {
        const arr = props.messages()
        if (seen < 0) {
          seen = arr.length // first batch was a replay without an epoch bump
          return
        }
        const fresh = arr.slice(seen)
        seen = arr.length
        if (fresh.length === 0) return
        const added = fresh.map((m) => ({ id: nextId++, from: m.from, text: m.text }))
        setItems((list) => [...list, ...added].slice(-MAX_FLOATS))
        for (const item of added) {
          const tm = window.setTimeout(() => {
            timers.delete(tm)
            setItems((list) => list.filter((x) => x.id !== item.id))
          }, FLOAT_TTL_MS)
          timers.add(tm)
        }
      },
      { defer: true },
    ),
  )
  onCleanup(() => {
    for (const tm of timers) clearTimeout(tm)
  })

  return (
    <div
      class="pointer-events-none absolute bottom-16 left-3 z-10 flex w-[min(24rem,calc(100%-1.5rem))] flex-col items-start gap-1.5 sm:left-4"
      aria-hidden="true"
    >
      <For each={items()}>
        {(m) => (
          <div class="chat-float-item max-w-full rounded bg-room/80 px-3 py-1.5 backdrop-blur-sm">
            <span class="font-hud text-xs text-fog">{nameFor(m.from, props.my())}</span>{' '}
            <span class="text-sm break-words text-paper">{m.text}</span>
          </div>
        )}
      </For>
    </div>
  )
}

/**
 * Always-visible Chat input (Q6 revised). Enter or the button sends; a
 * failed send keeps the text — nothing is lost silently.
 */
export function ChatInput(props: {
  canSend: () => boolean
  onSend: (text: string) => boolean
}): JSX.Element {
  let inputEl: HTMLInputElement | undefined

  const submit = (e: SubmitEvent) => {
    e.preventDefault()
    const value = inputEl?.value.trim() ?? ''
    if (!value || !props.canSend()) return
    if (props.onSend(value) && inputEl) inputEl.value = ''
  }

  return (
    <form onSubmit={submit} class="flex min-w-0 flex-1 gap-2">
      <input
        ref={inputEl}
        type="text"
        maxlength={MAX_CHAT_TEXT}
        disabled={!props.canSend()}
        placeholder={props.canSend() ? t('chatPlaceholder') : t('chatNeedsViewer')}
        aria-label={t('chat')}
        class="min-w-0 flex-1 rounded border border-line bg-panel px-3 py-2 text-sm text-paper placeholder:text-fog/50 focus:border-fog disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!props.canSend()}
        class="shrink-0 rounded bg-paper px-3 py-2 text-sm font-medium text-room transition-opacity disabled:opacity-30"
      >
        {t('send')}
      </button>
    </form>
  )
}
