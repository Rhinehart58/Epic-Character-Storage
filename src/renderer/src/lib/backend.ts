import type { IAppBackend } from './backend-types'
import { ipcBackend } from './ipc-backend'
import { createRemoteBackendStub } from './remote-backend'

function resolveBackend(): IAppBackend {
  const mode = import.meta.env.VITE_BACKEND_MODE
  const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')

  if (mode === 'remote') {
    if (!baseUrl) {
      console.warn('[backend] VITE_BACKEND_MODE=remote but VITE_API_BASE_URL is empty; using IPC backend.')
      return ipcBackend
    }
    return createRemoteBackendStub({ baseUrl })
  }

  return ipcBackend
}

/** Use this instead of `window.*Api` so the UI can switch to HTTP/WebSocket later. */
export const backend: IAppBackend = resolveBackend()
