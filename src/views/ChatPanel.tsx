import { createEffect, createSignal, on, Show, For, type JSX } from 'solid-js'
import { MAX_CHAT_TEXT, type ChatMessage, type SenderLabel } from '../lib/protocol'
import { formatClock } from '../lib/util'
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

/**
 * Chat overlay panel (R1 group chat, Q6 toggle). Bottom sheet on phones,
 * docked card on larger screens. Never shrinks the Feed.
 */
export function ChatPanel(props: {
  messages: () => readonly ChatMessage[]
  my: () => SenderLabel | null
  canSend: () => boolean
  onSend: (text: string) => boolean
  onClose: () => void
}): JSX.Element {
  let listEl: HTMLDivElement | undefined
  let inputEl: HTMLInputElement | undefined

  // Newest at the bottom; keep it in view as messages arrive.
  createEffect(
    on(
      () => props.messages().length,
      () => listEl?.scrollTo({ top: listEl.scrollHeight }),
      { defer: true },
    ),
  )

  const submit = (e: SubmitEvent) => {
    e.preventDefault()
    const value = inputEl?.value.trim() ?? ''
    if (!value || !props.canSend()) return
    // Keep the text on a failed send (line down) — nothing is lost silently.
    if (props.onSend(value) && inputEl) inputEl.value = ''
  }

  return (
    <section
      class="absolute inset-x-0 bottom-0 z-20 flex max-h-[70%] flex-col border-t border-line bg-room/95 backdrop-blur-sm sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-h-[60%] sm:w-96 sm:rounded sm:border"
      aria-label={t('chat')}
    >
      <header class="flex items-center justify-between border-b border-line px-4 py-2">
        <span class="text-sm text-fog">{t('chat')}</span>
        <button
          class="px-1 text-fog hover:text-paper"
          onClick={props.onClose}
          aria-label={t('chatClose')}
        >
          ×
        </button>
      </header>

      <div ref={listEl} class="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        <Show
          when={props.messages().length > 0}
          fallback={<p class="text-sm text-fog">{t('chatEmpty')}</p>}
        >
          <For each={props.messages()}>
            {(m) => (
              <div class="flex flex-col gap-0.5">
                <div class="flex items-baseline gap-2">
                  <span class="font-hud text-xs text-fog">{nameFor(m.from, props.my())}</span>
                  <span class="font-hud text-xs text-fog/60">{formatClock(m.ts)}</span>
                </div>
                <p class="text-sm break-words text-paper">{m.text}</p>
              </div>
            )}
          </For>
        </Show>
      </div>

      <form onSubmit={submit} class="flex gap-2 border-t border-line px-4 py-3">
        <input
          ref={inputEl}
          type="text"
          maxlength={MAX_CHAT_TEXT}
          disabled={!props.canSend()}
          placeholder={props.canSend() ? t('chatPlaceholder') : t('chatNeedsViewer')}
          class="min-w-0 flex-1 rounded border border-line bg-panel px-3 py-2 text-sm text-paper placeholder:text-fog/50 focus:border-fog disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!props.canSend()}
          class="rounded bg-paper px-3 py-2 text-sm font-medium text-room transition-opacity disabled:opacity-30"
        >
          {t('send')}
        </button>
      </form>
    </section>
  )
}

/** Chat toggle with an unread dot while the panel is closed. */
export function ChatButton(props: {
  unread: () => number
  onClick: () => void
}): JSX.Element {
  return (
    <button
      class="relative rounded border border-line bg-panel px-4 py-2 text-sm text-paper hover:border-fog"
      onClick={props.onClick}
    >
      {t('chat')}
      <Show when={props.unread() > 0}>
        <span class="absolute -top-1 -right-1 inline-block size-2 rounded-full bg-caution" aria-hidden="true" />
      </Show>
    </button>
  )
}

/** Unread count: grows on each arriving message while closed, clears on
 *  open. `count` gates batches that are not new arrivals (history replay). */
export function createUnread(
  messages: () => readonly unknown[],
  open: () => boolean,
  count: () => boolean = () => true,
): () => number {
  const [unread, setUnread] = createSignal(0)
  createEffect(
    on(
      () => messages().length,
      () => {
        if (!open() && count()) setUnread((u) => u + 1)
      },
      { defer: true },
    ),
  )
  createEffect(() => {
    if (open()) setUnread(0)
  })
  return unread
}
