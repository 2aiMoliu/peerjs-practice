import { Landing } from './views/Landing'
import { CameraView } from './views/CameraView'
import { ViewerView } from './views/ViewerView'

/** Modes by query param — no router (Q1). */
export default function App() {
  const params = new URLSearchParams(location.search)
  const mode = params.get('mode')
  const code = params.get('code') ?? undefined

  if (mode === 'camera') return <CameraView />
  if (mode === 'view') return <ViewerView initialCode={code} />
  return <Landing />
}
