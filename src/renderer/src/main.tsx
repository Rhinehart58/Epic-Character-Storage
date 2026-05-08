import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { EcsErrorBoundary } from './components/EcsErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EcsErrorBoundary>
      <App />
    </EcsErrorBoundary>
  </StrictMode>
)

window.requestAnimationFrame(() => {
  const splash = document.getElementById('boot-splash')
  if (!splash) return
  let minVisibleMs = 3000
  try {
    const raw = window.localStorage.getItem('ecs_startup_splash_ms_v1')
    const parsed = Number(raw)
    if (parsed === 1200 || parsed === 2200 || parsed === 3000 || parsed === 4500) {
      minVisibleMs = parsed
    }
  } catch {
    // ignore localStorage access failures
  }
  window.setTimeout(() => {
    splash.classList.add('is-ready')
    document.body.classList.remove('booting')
    window.setTimeout(() => splash.remove(), 360)
  }, minVisibleMs)
})
