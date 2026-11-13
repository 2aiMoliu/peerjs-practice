import { For } from 'solid-js'
import { lang, switchLang, type Lang } from '../lib/i18n'

/** EN / 日本語 toggle, top-left, quiet. */
export function LangSwitcher() {
  const options: Lang[] = ['en', 'ja']
  const label: Record<Lang, string> = { en: 'EN', ja: '日本語' }
  return (
    <div
      class="absolute top-3 left-3 z-50 flex gap-1 rounded border border-line bg-room/80 p-1 backdrop-blur-sm"
      role="group"
      aria-label="Language"
    >
      <For each={options}>
        {(opt) => (
          <button
            class="rounded px-2 py-0.5 text-xs text-fog hover:text-paper aria-selected:bg-panel aria-selected:text-paper"
            aria-selected={lang() === opt}
            onClick={() => switchLang(opt)}
          >
            {label[opt]}
          </button>
        )}
      </For>
    </div>
  )
}

