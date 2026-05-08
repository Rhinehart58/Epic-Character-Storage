import type { IAppBackend } from './backend-types'

/**
 * Placeholder remote backend. Wire each call to your HTTP API (or WebSocket for `syncApi`).
 *
 * Suggested REST layout (JSON, Bearer or session cookie — your choice):
 * - GET    /v1/characters?accountId=&campaignId=
 * - POST   /v1/characters
 * - DELETE /v1/characters/:id
 * - POST   /v1/characters/:id/attacks/generate
 * - GET    /v1/campaigns?accountId=
 * - POST   /v1/campaigns
 * - POST   /v1/campaigns/join
 * - POST   /v1/campaigns/:id/leave
 * - GET    /v1/campaigns/:id/members
 * - GET    /v1/battle/:campaignId
 * - PUT    /v1/battle/:campaignId
 * - POST   /v1/auth/login … (mirror existing auth payloads)
 *
 * Realtime: expose `sync:changed`-equivalent events over WebSocket (same payload shape as `SyncChangedBroadcast`)
 * and call the `onChanged` listener from `remote-backend` when messages arrive.
 */
export function createRemoteBackendStub(_options: { baseUrl: string }): IAppBackend {
  const err = (name: string): never => {
    throw new Error(
      `[remote-backend] "${name}" is not implemented yet. Implement fetch/WebSocket in src/renderer/src/lib/remote-backend.ts (base: ${_options.baseUrl}).`
    )
  }

  return {
    characterApi: {
      list: () => err('characterApi.list'),
      save: () => err('characterApi.save'),
      remove: () => err('characterApi.remove'),
      generateAttacks: () => err('characterApi.generateAttacks')
    },
    campaignApi: {
      listForAccount: () => err('campaignApi.listForAccount'),
      create: () => err('campaignApi.create'),
      joinByCode: () => err('campaignApi.joinByCode'),
      members: () => err('campaignApi.members'),
      leave: () => err('campaignApi.leave')
    },
    battleApi: {
      getState: () => err('battleApi.getState'),
      saveState: () => err('battleApi.saveState')
    },
    syncApi: {
      onChanged: () => {
        return (): void => {}
      }
    },
    authApi: {
      register: () => err('authApi.register'),
      login: () => err('authApi.login'),
      devLogin: () => err('authApi.devLogin'),
      logout: () => err('authApi.logout'),
      sendTestEmail: () => err('authApi.sendTestEmail'),
      smtpStatus: () => err('authApi.smtpStatus'),
      requestReset: () => err('authApi.requestReset'),
      resetWithToken: () => err('authApi.resetWithToken')
    },
    accountApi: {
      list: () => err('accountApi.list'),
      getActive: () => err('accountApi.getActive'),
      setActive: () => err('accountApi.setActive')
    },
    portraitApi: {
      choose: () => err('portraitApi.choose'),
      remove: () => err('portraitApi.remove')
    },
    appApi: {
      getVersion: () => err('appApi.getVersion'),
      getPrefs: () => err('appApi.getPrefs'),
      setPrefs: () => err('appApi.setPrefs'),
      updateStatus: async () => ({ phase: 'idle' as const }),
      updateCheck: async () => ({ ok: false, message: 'Auto-update is unavailable in remote backend mode.' }),
      updateDownload: async () => ({ ok: false, message: 'Auto-update is unavailable in remote backend mode.' }),
      updateInstall: async () => ({ ok: false, message: 'Auto-update is unavailable in remote backend mode.' }),
      onUpdateStatus: () => () => {}
    }
  }
}
