import { app, shell, BrowserWindow, ipcMain, protocol, nativeTheme } from 'electron'
import { join, relative, resolve } from 'path'
import { existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { autoUpdater } from 'electron-updater'
import {
  createAccount,
  createCampaign,
  deleteCharacter,
  getCampaignBattleState,
  getActiveAccountId,
  getCampaignById,
  getCharacterById,
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
  resolveAccountDisplayName,
  saveCampaignBattleState,
  saveCharacter,
  setActiveAccount
} from './character-store'
import { generateAttacksFromKeywords } from '../shared/attack-generator'
import { getSmtpStatus, sendAccountConfirmationEmail, sendTestEmail } from './mailer'
import type { CharacterSaveInput, SyncActivityPayload, SyncChangedBroadcast } from '../shared/character-types'
import { deletePortraitIfExists, pickAndStorePortrait, portraitsRoot } from './portraits'
import { getPrefs, setPrefs } from './app-prefs'

type UpdateStatusPayload = {
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'
  version?: string
  progress?: number
  message?: string
}

let updateStatus: UpdateStatusPayload = { phase: 'idle' }

function detectLegacyInstallPaths(): string[] {
  if (process.platform !== 'darwin') return []
  const homeApps = join(app.getPath('home'), 'Applications')
  const candidates = [
    '/Applications/Epic Character Storage.app',
    '/Applications/epic-character-storage.app',
    '/Applications/Epic-Character-Storage.app',
    join(homeApps, 'Epic Character Storage.app'),
    join(homeApps, 'epic-character-storage.app'),
    join(homeApps, 'Epic-Character-Storage.app')
  ]
  return candidates.filter((path) => existsSync(path))
}

function publishUpdateStatus(payload: UpdateStatusPayload): void {
  updateStatus = payload
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('app:update-status', payload)
  }
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    publishUpdateStatus({ phase: 'checking', message: 'Checking for updates...' })
  })
  autoUpdater.on('update-available', (info) => {
    publishUpdateStatus({ phase: 'available', version: info.version, message: 'Update available.' })
  })
  autoUpdater.on('update-not-available', () => {
    publishUpdateStatus({ phase: 'up-to-date', message: 'You are up to date.' })
  })
  autoUpdater.on('error', (error) => {
    publishUpdateStatus({ phase: 'error', message: error?.message ?? 'Update failed.' })
  })
  autoUpdater.on('download-progress', (progress) => {
    publishUpdateStatus({
      phase: 'downloading',
      progress: Math.max(0, Math.min(100, Math.round(progress.percent))),
      message: 'Downloading update...'
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    publishUpdateStatus({
      phase: 'downloaded',
      version: info.version,
      progress: 100,
      message: 'Update ready to install.'
    })
  })
}

function publishRealtimeUpdate(
  scope: SyncChangedBroadcast['scope'],
  campaignId?: string | null,
  activity?: Omit<SyncActivityPayload, 'at'> & { at?: number }
): void {
  const at = Date.now()
  const payload: SyncChangedBroadcast = {
    scope,
    campaignId: campaignId === undefined ? null : campaignId,
    at,
    activity: activity
      ? {
          kind: activity.kind,
          actorAccountId: activity.actorAccountId,
          actorDisplayName: activity.actorDisplayName,
          campaignId: activity.campaignId,
          summary: activity.summary,
          at: activity.at ?? at
        }
      : undefined
  }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('sync:changed', payload)
  }
}

function createWindow(): void {
  const bootPrefs = getPrefs(['guestAppearance'])
  let bootTheme = 'default'
  let bootTone: 'light' | 'dark' = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  try {
    const raw = bootPrefs.guestAppearance
    if (raw) {
      const parsed = JSON.parse(raw) as { colorScheme?: unknown; themeMode?: unknown }
      if (typeof parsed.colorScheme === 'string') bootTheme = parsed.colorScheme
      if (parsed.themeMode === 'dark') bootTone = 'dark'
      else if (parsed.themeMode === 'light') bootTone = 'light'
    }
  } catch {
    // ignore malformed stored appearance
  }
  const validThemes = new Set([
    'default',
    'violet',
    'teal',
    'sunset',
    'wii',
    'ps3',
    'xbox360',
    'cube',
    'wiiu',
    '3ds',
    'bee'
  ])
  if (!validThemes.has(bootTheme)) bootTheme = 'default'

  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 720,
    minWidth: 880,
    minHeight: 620,
    show: false,
    backgroundColor: '#020617',
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
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    url.searchParams.set('bootTheme', bootTheme)
    url.searchParams.set('bootTone', bootTone)
    mainWindow.loadURL(url.toString())
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { bootTheme, bootTone }
    })
  }
}

ipcMain.handle('characters:list', async (_event, payload: { accountId: string; campaignId: string | null }) =>
  listCharactersForContext(payload.accountId, payload.campaignId)
)
ipcMain.handle('characters:save', async (_event, payload: CharacterSaveInput) => {
  const prior = getCharacterById(payload.id ?? undefined)
  const saved = saveCharacter(payload)
  const actorId = saved.ownerAccountId
  publishRealtimeUpdate('characters', saved.campaignId ?? null, {
    kind: prior ? 'character_updated' : 'character_created',
    actorAccountId: actorId,
    actorDisplayName: resolveAccountDisplayName(actorId),
    campaignId: saved.campaignId,
    summary: prior
      ? `updated character “${saved.name}”.`
      : `added character “${saved.name}”.`
  })
  return saved
})
ipcMain.handle('characters:delete', async (_event, id: string) => {
  const victim = getCharacterById(id)
  const actorId = getActiveAccountId()
  deleteCharacter(id)
  publishRealtimeUpdate('characters', victim?.campaignId ?? null, {
    kind: 'character_deleted',
    actorAccountId: actorId,
    actorDisplayName: resolveAccountDisplayName(actorId),
    campaignId: victim?.campaignId ?? null,
    summary: victim ? `removed character “${victim.name}”.` : 'removed a character.'
  })
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
ipcMain.handle('app:getPrefs', async (_event, keys: string[]) => getPrefs(Array.isArray(keys) ? keys : []))
ipcMain.handle('app:setPrefs', async (_event, entries: Record<string, string | null>) =>
  setPrefs(entries && typeof entries === 'object' ? entries : {})
)
ipcMain.handle('app:updateStatus', async () => updateStatus)
ipcMain.handle('app:updateCheck', async () => {
  if (!app.isPackaged) {
    publishUpdateStatus({ phase: 'error', message: 'Updater works in packaged builds only.' })
    return { ok: false as const, message: 'Updater works in packaged builds only.' }
  }
  try {
    await autoUpdater.checkForUpdates()
    return { ok: true as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check for updates.'
    publishUpdateStatus({ phase: 'error', message })
    return { ok: false as const, message }
  }
})
ipcMain.handle('app:updateDownload', async () => {
  if (!app.isPackaged) {
    publishUpdateStatus({ phase: 'error', message: 'Updater works in packaged builds only.' })
    return { ok: false as const, message: 'Updater works in packaged builds only.' }
  }
  try {
    await autoUpdater.downloadUpdate()
    return { ok: true as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to download update.'
    publishUpdateStatus({ phase: 'error', message })
    return { ok: false as const, message }
  }
})
ipcMain.handle('app:updateInstall', async () => {
  if (!app.isPackaged) {
    publishUpdateStatus({ phase: 'error', message: 'Updater works in packaged builds only.' })
    return { ok: false as const, message: 'Updater works in packaged builds only.' }
  }
  setImmediate(() => autoUpdater.quitAndInstall())
  return { ok: true as const }
})
ipcMain.handle('app:getLegacyInstalls', async () => ({ paths: detectLegacyInstallPaths() }))
ipcMain.handle('app:openPath', async (_event, path: string) => {
  if (typeof path !== 'string' || !path.trim()) return { ok: false as const, message: 'Invalid path.' }
  const error = await shell.openPath(path)
  return error ? { ok: false as const, message: error } : { ok: true as const }
})

ipcMain.handle('accounts:getActive', async () => getActiveAccountId())
ipcMain.handle('accounts:setActive', async (_event, accountId: string) => setActiveAccount(accountId))
ipcMain.handle('campaigns:listForAccount', async (_event, accountId: string) =>
  listCampaignsForAccount(accountId)
)
ipcMain.handle('campaigns:create', async (_event, payload: { accountId: string; name: string }) => {
  const created = createCampaign(payload.accountId, payload.name)
  publishRealtimeUpdate('campaigns', created.id, {
    kind: 'campaign_created',
    actorAccountId: payload.accountId,
    actorDisplayName: resolveAccountDisplayName(payload.accountId),
    campaignId: created.id,
    summary: `created shared campaign “${created.name}”.`
  })
  return created
})
ipcMain.handle('campaigns:joinByCode', async (_event, payload: { accountId: string; code: string }) => {
  const joined = joinCampaignByCode(payload.accountId, payload.code)
  if (joined) {
    publishRealtimeUpdate('campaigns', joined.id, {
      kind: 'campaign_joined',
      actorAccountId: payload.accountId,
      actorDisplayName: resolveAccountDisplayName(payload.accountId),
      campaignId: joined.id,
      summary: `joined campaign “${joined.name}”.`
    })
  }
  return joined
})
ipcMain.handle('campaigns:members', async (_event, campaignId: string) => listCampaignMembers(campaignId))
ipcMain.handle(
  'campaigns:leave',
  async (_event, payload: { accountId: string; campaignId: string }) => {
    const campaign = getCampaignById(payload.campaignId)
    const result = leaveCampaign(payload.accountId, payload.campaignId)
    if (result.ok) {
      publishRealtimeUpdate('campaigns', payload.campaignId, {
        kind: 'campaign_left',
        actorAccountId: payload.accountId,
        actorDisplayName: resolveAccountDisplayName(payload.accountId),
        campaignId: payload.campaignId,
        summary: campaign ? `left campaign “${campaign.name}”.` : 'left a campaign.'
      })
    }
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
    const n = payload.participants.length
    publishRealtimeUpdate('battle', payload.campaignId, {
      kind: 'battle_updated',
      actorAccountId: payload.updatedByAccountId,
      actorDisplayName: resolveAccountDisplayName(payload.updatedByAccountId),
      campaignId: payload.campaignId,
      summary: `updated the encounter (round ${payload.round}, ${n} on the board).`
    })
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
      batchId?: string
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
  setupAutoUpdater()
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
