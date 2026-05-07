/**
 * Single object shape the UI uses for persistence, auth, and sync.
 * Today this is satisfied by Electron preload (`window.*Api`); later by `fetch` / WebSocket to your server.
 */
export type IAppBackend = Pick<
  Window,
  'characterApi' | 'campaignApi' | 'battleApi' | 'syncApi' | 'authApi' | 'accountApi' | 'portraitApi' | 'appApi'
>
