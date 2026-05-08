import { ElectronAPI } from '@electron-toolkit/preload'
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

declare global {
  interface Window {
    electron: ElectronAPI
    characterApi: {
      list: (payload: { accountId: string; campaignId: string | null }) => Promise<CharacterRecord[]>
      save: (payload: CharacterSaveInput) => Promise<CharacterRecord>
      remove: (id: string) => Promise<void>
      generateAttacks: (payload: {
        characterId: string
        characterName: string
        archetype: string
        level: number
        keywords: string[]
        stats: CharacterSaveInput['stats']
        batchId?: string
      }) => Promise<GeneratedAttackResult>
    }
    accountApi: {
      list: () => Promise<UserAccount[]>
      getActive: () => Promise<string | null>
      setActive: (accountId: string) => Promise<void>
    }
    authApi: {
      register: (payload: { displayName: string; email: string; password: string }) => Promise<AuthResult>
      login: (payload: { email: string; password: string }) => Promise<AuthResult>
      devLogin: (password: string) => Promise<AuthResult>
      logout: () => Promise<SimpleResult>
      sendTestEmail: (email: string) => Promise<SimpleResult>
      smtpStatus: () => Promise<SmtpStatusResult>
      requestReset: (email: string) => Promise<PasswordResetRequestResult>
      resetWithToken: (payload: {
        email: string
        token: string
        newPassword: string
      }) => Promise<SimpleResult>
    }
    campaignApi: {
      listForAccount: (accountId: string) => Promise<CampaignRecord[]>
      create: (payload: { accountId: string; name: string }) => Promise<CampaignRecord>
      joinByCode: (payload: { accountId: string; code: string }) => Promise<CampaignRecord | null>
      members: (campaignId: string) => Promise<UserAccount[]>
      leave: (payload: { accountId: string; campaignId: string }) => Promise<SimpleResult>
    }
    battleApi: {
      getState: (campaignId: string) => Promise<CampaignBattleState | null>
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
      }) => Promise<CampaignBattleState>
    }
    syncApi: {
      onChanged: (callback: (payload: SyncChangedBroadcast) => void) => () => void
    }
    appApi: {
      getVersion: () => Promise<string>
      getPrefs: (keys: string[]) => Promise<Record<string, string | null>>
      setPrefs: (entries: Record<string, string | null>) => Promise<{ ok: true }>
    }
    portraitApi: {
      choose: (payload: { characterId: string | null }) => Promise<{
        ok: boolean
        message?: string
        portraitRelativePath?: string
      }>
      remove: (relativePath: string) => Promise<{ ok: boolean }>
    }
  }
}

export {}
