import { Landing } from './views/Landing'
import { CameraView } from './views/CameraView'
import { ViewerView } from './views/ViewerView'
import { LangSwitcher } from './views/LangSwitcher'

/** Modes by query param — no router (Q1). */
export default function App() {
  const params = new URLSearchParams(location.search)
  const mode = params.get('mode')
  const code = params.get('code') ?? undefined

  return (
    <div class="relative h-full">
      <LangSwitcher />
      {mode === 'camera' ? <CameraView /> : mode === 'view' ? <ViewerView initialCode={code} /> : <Landing />}
    </div>
  )
}
