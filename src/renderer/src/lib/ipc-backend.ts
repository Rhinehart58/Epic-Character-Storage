import type { IAppBackend } from './backend-types'

/** Default backend: Electron main process via preload IPC. */
export const ipcBackend: IAppBackend = {
  characterApi: window.characterApi,
  campaignApi: window.campaignApi,
  battleApi: window.battleApi,
  syncApi: window.syncApi,
  authApi: window.authApi,
  accountApi: window.accountApi,
  portraitApi: window.portraitApi,
  appApi: window.appApi
}
