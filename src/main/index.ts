import { app, shell, BrowserWindow, ipcMain, protocol } from 'electron'
import { join, relative, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  createAccount,
  createCampaign,
  deleteCharacter,
  getCampaignBattleState,
  getActiveAccountId,
  loginAccount,
  loginDevMode,
  logoutActiveAccount,
  joinCampaignByCode,
  leaveCampaign,
  listAccounts,
  listCampaignMembers,
  listCampaignsForAccount,
  listCharactersForContext,
  requestPasswordReset,
  resetPasswordWithToken,
  saveCampaignBattleState,
  saveCharacter,
  setActiveAccount
} from './character-store'
import { generateAttacksFromKeywords } from '../shared/attack-generator'
import { getSmtpStatus, sendAccountConfirmationEmail, sendTestEmail } from './mailer'
import type { CharacterSaveInput } from '../shared/character-types'
import { deletePortraitIfExists, pickAndStorePortrait, portraitsRoot } from './portraits'

function publishRealtimeUpdate(scope: 'characters' | 'campaigns' | 'battle', campaignId?: string): void {
  const payload = { scope, campaignId: campaignId ?? null, at: Date.now() }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('sync:changed', payload)
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 720,
    minWidth: 880,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('characters:list', async (_event, payload: { accountId: string; campaignId: string | null }) =>
  listCharactersForContext(payload.accountId, payload.campaignId)
)
ipcMain.handle('characters:save', async (_event, payload: CharacterSaveInput) => {
  const saved = saveCharacter(payload)
  publishRealtimeUpdate('characters', saved.campaignId ?? undefined)
  return saved
})
ipcMain.handle('characters:delete', async (_event, id: string) => {
  deleteCharacter(id)
  publishRealtimeUpdate('characters')
})
ipcMain.handle(
  'portraits:choose',
  async (_event, payload: { characterId: string | null }) => pickAndStorePortrait(payload.characterId)
)
ipcMain.handle('portraits:remove', async (_event, relativePath: string) => {
  deletePortraitIfExists(relativePath)
  return { ok: true as const }
})
ipcMain.handle('accounts:list', async () => listAccounts())
ipcMain.handle(
  'auth:register',
  async (_event, payload: { displayName: string; email: string; password: string }) => {
    const created = createAccount(payload)
    if (!created.ok || !created.account) return created
    const mail = await sendAccountConfirmationEmail({
      email: created.account.email,
      displayName: created.account.displayName
    })
    return {
      ...created,
      message: mail.message
    }
  }
)
ipcMain.handle('auth:login', async (_event, payload: { email: string; password: string }) =>
  loginAccount(payload.email, payload.password)
)
ipcMain.handle('auth:devLogin', async (_event, password: string) => loginDevMode(password))
ipcMain.handle('auth:logout', async () => logoutActiveAccount())
ipcMain.handle('auth:sendTestEmail', async (_event, email: string) => sendTestEmail(email))
ipcMain.handle('auth:smtpStatus', async () => getSmtpStatus())
ipcMain.handle('auth:requestReset', async (_event, email: string) => requestPasswordReset(email))
ipcMain.handle(
  'auth:resetWithToken',
  async (_event, payload: { email: string; token: string; newPassword: string }) =>
    resetPasswordWithToken(payload.email, payload.token, payload.newPassword)
)
ipcMain.handle('app:getVersion', () => app.getVersion())

ipcMain.handle('accounts:getActive', async () => getActiveAccountId())
ipcMain.handle('accounts:setActive', async (_event, accountId: string) => setActiveAccount(accountId))
ipcMain.handle('campaigns:listForAccount', async (_event, accountId: string) =>
  listCampaignsForAccount(accountId)
)
ipcMain.handle('campaigns:create', async (_event, payload: { accountId: string; name: string }) =>
  {
    const created = createCampaign(payload.accountId, payload.name)
    publishRealtimeUpdate('campaigns', created.id)
    return created
  })
ipcMain.handle('campaigns:joinByCode', async (_event, payload: { accountId: string; code: string }) =>
  {
    const joined = joinCampaignByCode(payload.accountId, payload.code)
    publishRealtimeUpdate('campaigns', joined?.id)
    return joined
  })
ipcMain.handle('campaigns:members', async (_event, campaignId: string) => listCampaignMembers(campaignId))
ipcMain.handle(
  'campaigns:leave',
  async (_event, payload: { accountId: string; campaignId: string }) => {
    const result = leaveCampaign(payload.accountId, payload.campaignId)
    publishRealtimeUpdate('campaigns', payload.campaignId)
    return result
  }
)
ipcMain.handle('battle:getState', async (_event, campaignId: string) => getCampaignBattleState(campaignId))
ipcMain.handle(
  'battle:saveState',
  async (
    _event,
    payload: {
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
    }
  ) => {
    const state = saveCampaignBattleState(payload)
    publishRealtimeUpdate('battle', payload.campaignId)
    return state
  }
)

ipcMain.handle(
  'attacks:generate',
  async (
    _event,
    payload: {
      characterId: string
      characterName: string
      archetype: string
      level: number
      keywords: string[]
      stats: CharacterSaveInput['stats']
    }
  ) => generateAttacksFromKeywords(payload)
)

function registerPortraitProtocol(): void {
  protocol.registerFileProtocol('ecs-portrait', (request, callback) => {
    try {
      const stripped = request.url.replace(/^ecs-portrait:\/\//, '').replace(/^\/*/, '')
      const decoded = decodeURIComponent(stripped)
      if (!decoded.startsWith('portraits/')) {
        callback({ error: -10 })
        return
      }
      const absolute = resolve(join(app.getPath('userData'), decoded))
      const root = resolve(portraitsRoot())
      const rel = relative(root, absolute)
      if (rel.startsWith('..')) {
        callback({ error: -10 })
        return
      }
      callback({ path: absolute })
    } catch {
      callback({ error: -2 })
    }
  })
}

app.whenReady().then(() => {
  registerPortraitProtocol()
  electronApp.setAppUserModelId('com.epiccharacterstorage.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
