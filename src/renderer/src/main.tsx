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
