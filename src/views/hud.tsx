import { createSignal, onCleanup } from 'solid-js'
import type { JSX } from 'solid-js'
import { formatElapsed } from '../lib/util'

export function liveDot(): JSX.Element {
  return (
    <span
      class="inline-block size-2 rounded-full bg-signal animate-live"
      aria-hidden="true"
    />
  )
}

/** Ticking timecode string for the HUD. */
export function useTimecode(startedAt: () => number | null): () => string {
  const [tick, setTick] = createSignal(0)
  const i = setInterval(() => setTick((t) => t + 1), 1000)
  onCleanup(() => clearInterval(i))
  return () => {
    void tick()
    return formatElapsed(startedAt())
  }
}
