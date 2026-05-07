/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UPDATE_LOG_URL?: string
  /** `ipc` (default): Electron main process. `remote`: use `VITE_API_BASE_URL` + `remote-backend.ts` (stub until you implement). */
  readonly VITE_BACKEND_MODE?: 'ipc' | 'remote'
  /** Base URL for remote backend, e.g. `https://api.example.com` (no trailing slash). */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
