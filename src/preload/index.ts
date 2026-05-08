import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AuthResult,
  CampaignBattleState,
  CampaignRecord,
  CharacterRecord,
  CharacterSaveInput,
  GeneratedAttackResult,
  PasswordResetRequestResult,
  SimpleResult,
  SmtpStatusResult,
  SyncChangedBroadcast,
  UserAccount
} from '../shared/character-types'

const characterApi = {
  list: (payload: { accountId: string; campaignId: string | null }): Promise<CharacterRecord[]> =>
    ipcRenderer.invoke('characters:list', payload),
  save: (payload: CharacterSaveInput): Promise<CharacterRecord> =>
    ipcRenderer.invoke('characters:save', payload),
  remove: (id: string): Promise<void> => ipcRenderer.invoke('characters:delete', id),
  generateAttacks: (payload: {
    characterId: string
    characterName: string
    archetype: string
    level: number
    keywords: string[]
    stats: CharacterSaveInput['stats']
    batchId?: string
  }): Promise<GeneratedAttackResult> => ipcRenderer.invoke('attacks:generate', payload)
}

const accountApi = {
  list: (): Promise<UserAccount[]> => ipcRenderer.invoke('accounts:list'),
  getActive: (): Promise<string | null> => ipcRenderer.invoke('accounts:getActive'),
  setActive: (accountId: string): Promise<void> => ipcRenderer.invoke('accounts:setActive', accountId)
}

const authApi = {
  register: (payload: { displayName: string; email: string; password: string }): Promise<AuthResult> =>
    ipcRenderer.invoke('auth:register', payload),
  login: (payload: { email: string; password: string }): Promise<AuthResult> =>
    ipcRenderer.invoke('auth:login', payload),
  devLogin: (password: string): Promise<AuthResult> => ipcRenderer.invoke('auth:devLogin', password),
  logout: (): Promise<SimpleResult> => ipcRenderer.invoke('auth:logout'),
  sendTestEmail: (email: string): Promise<SimpleResult> => ipcRenderer.invoke('auth:sendTestEmail', email),
  smtpStatus: (): Promise<SmtpStatusResult> => ipcRenderer.invoke('auth:smtpStatus'),
  requestReset: (email: string): Promise<PasswordResetRequestResult> =>
    ipcRenderer.invoke('auth:requestReset', email),
  resetWithToken: (payload: {
    email: string
    token: string
    newPassword: string
  }): Promise<SimpleResult> => ipcRenderer.invoke('auth:resetWithToken', payload)
}

const campaignApi = {
  listForAccount: (accountId: string): Promise<CampaignRecord[]> =>
    ipcRenderer.invoke('campaigns:listForAccount', accountId),
  create: (payload: { accountId: string; name: string }): Promise<CampaignRecord> =>
    ipcRenderer.invoke('campaigns:create', payload),
  joinByCode: (payload: { accountId: string; code: string }): Promise<CampaignRecord | null> =>
    ipcRenderer.invoke('campaigns:joinByCode', payload),
  members: (campaignId: string): Promise<UserAccount[]> => ipcRenderer.invoke('campaigns:members', campaignId),
  leave: (payload: { accountId: string; campaignId: string }): Promise<SimpleResult> =>
    ipcRenderer.invoke('campaigns:leave', payload)
}

const battleApi = {
  getState: (campaignId: string): Promise<CampaignBattleState | null> =>
    ipcRenderer.invoke('battle:getState', campaignId),
  saveState: (payload: {
    campaignId: string
    participants: string[]
    drafts: Record<
      string,
      {
        hpCurrent: number
        armorCurrent: number
        initiative: number
        notes: string
        conditions: string[]
        selectedAction: string
      }
    >
    round: number
    activeTurnIndex: number
    updatedByAccountId: string
  }): Promise<CampaignBattleState> => ipcRenderer.invoke('battle:saveState', payload)
}

const syncApi = {
  onChanged: (callback: (payload: SyncChangedBroadcast) => void): (() => void) => {
    const listener = (_event: unknown, payload: SyncChangedBroadcast): void => callback(payload)
    ipcRenderer.on('sync:changed', listener)
    return () => ipcRenderer.removeListener('sync:changed', listener)
  }
}

const appApi = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getPrefs: (keys: string[]): Promise<Record<string, string | null>> => ipcRenderer.invoke('app:getPrefs', keys),
  setPrefs: (entries: Record<string, string | null>): Promise<{ ok: true }> =>
    ipcRenderer.invoke('app:setPrefs', entries)
}

const portraitApi = {
  choose: (payload: { characterId: string | null }): Promise<{
    ok: boolean
    message?: string
    portraitRelativePath?: string
  }> => ipcRenderer.invoke('portraits:choose', payload),
  remove: (relativePath: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('portraits:remove', relativePath)
}

try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('characterApi', characterApi)
  contextBridge.exposeInMainWorld('accountApi', accountApi)
  contextBridge.exposeInMainWorld('authApi', authApi)
  contextBridge.exposeInMainWorld('campaignApi', campaignApi)
  contextBridge.exposeInMainWorld('battleApi', battleApi)
  contextBridge.exposeInMainWorld('syncApi', syncApi)
  contextBridge.exposeInMainWorld('appApi', appApi)
  contextBridge.exposeInMainWorld('portraitApi', portraitApi)
} catch (error) {
  console.error(error)
}
