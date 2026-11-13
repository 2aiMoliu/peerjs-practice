import { cameraUrl } from '../lib/util'

export function Landing() {
  return (
    <main class="flex h-full flex-col justify-center gap-10 px-5 sm:mx-auto sm:max-w-md sm:px-6">
      <h1 class="text-3xl font-semibold tracking-tight text-paper sm:text-4xl">
        Put a phone camera
        <br />
        on a desktop screen.
      </h1>

      <nav class="flex flex-col border-t border-line" aria-label="Pick a role">
        <a
          href={cameraUrl()}
          class="group flex items-baseline justify-between border-b border-line py-5 pr-1 hover:bg-panel"
        >
          <span>
            <span class="block text-lg font-medium text-paper">Open a camera</span>
            <span class="block text-sm text-fog">use this phone as source</span>
          </span>
          <span class="font-hud text-sm text-fog group-hover:text-paper">↗</span>
        </a>
        <a
          href={`?mode=view`}
          class="group flex items-baseline justify-between border-b border-line py-5 pr-1 hover:bg-panel"
        >
          <span>
            <span class="block text-lg font-medium text-paper">Watch a feed</span>
            <span class="block text-sm text-fog">enter a code</span>
          </span>
          <span class="font-hud text-sm text-fog group-hover:text-paper">↗</span>
        </a>
      </nav>

      <p class="text-sm text-fog">practice build · PeerJS cloud</p>
    </main>
  )
}
