import { app } from 'electron'
import { createHash } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type {
  AuthResult,
  CampaignBattleState,
  CampaignRecord,
  CharacterRecord,
  CharacterSaveInput,
  PasswordResetRequestResult,
  SimpleResult,
  UserAccount
} from '../shared/character-types'
import { deletePortraitIfExists, renameDraftPortrait } from './portraits'

type CharacterDatabase = {
  accounts: AccountRow[]
  campaigns: CampaignRecord[]
  battleStates: CampaignBattleState[]
  activeAccountId: string | null
  characters: CharacterRecord[]
}

type AccountRow = UserAccount & {
  passwordHash: string
  resetToken: string | null
  resetTokenExpiresAt: string | null
}

const DEV_MODE_PASSWORD = 'epic-dev'
const DEV_ACCOUNT_EMAIL = 'rhinedev@local.epic'
const LEGACY_DEV_ACCOUNT_EMAIL = 'dev@local.epic'
const DEV_ACCOUNT_DISPLAY_NAME = 'rhinedev'

function dbPath(): string {
  return join(app.getPath('userData'), 'epic-character-storage.json')
}

function readDb(): CharacterDatabase {
  try {
    const path = dbPath()
    if (!existsSync(path))
      return { accounts: [], campaigns: [], battleStates: [], activeAccountId: null, characters: [] }
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as CharacterDatabase
    const migratedAccounts: AccountRow[] = (parsed.accounts ?? []).map((raw: any, idx: number) => {
      const id = typeof raw?.id === 'string' ? raw.id : `acct-migrated-${idx}`
      const email =
        typeof raw?.email === 'string' && raw.email.includes('@')
          ? raw.email.toLowerCase()
          : `${id}@local.migrated`
      return {
        id,
        displayName:
          typeof raw?.displayName === 'string' && raw.displayName.trim().length > 0
            ? raw.displayName.trim()
            : 'Player',
        email,
        createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : nowIso(),
        passwordHash: typeof raw?.passwordHash === 'string' ? raw.passwordHash : hashPassword('changeme123A'),
        resetToken: typeof raw?.resetToken === 'string' ? raw.resetToken : null,
        resetTokenExpiresAt:
          typeof raw?.resetTokenExpiresAt === 'string' ? raw.resetTokenExpiresAt : null
      }
    })
    return {
      accounts: migratedAccounts,
      campaigns: parsed.campaigns ?? [],
      battleStates: (parsed.battleStates ?? []).map((row: any) => ({
        campaignId: row?.campaignId,
        participants: Array.isArray(row?.participants) ? row.participants.filter(Boolean) : [],
        drafts: Object.fromEntries(
          Object.entries(row?.drafts ?? {}).map(([id, draft]: [string, any]) => [
            id,
            {
              hpCurrent: Number(draft?.hpCurrent ?? 0),
              armorCurrent: Number(draft?.armorCurrent ?? 0),
              initiative: Number(draft?.initiative ?? 0),
              notes: typeof draft?.notes === 'string' ? draft.notes : '',
              conditions: Array.isArray(draft?.conditions) ? draft.conditions.filter(Boolean) : [],
              selectedAction: typeof draft?.selectedAction === 'string' ? draft.selectedAction : ''
            }
          ])
        ),
        round: Math.max(1, Number(row?.round ?? 1)),
        activeTurnIndex: Math.max(0, Number(row?.activeTurnIndex ?? 0)),
        updatedAt: typeof row?.updatedAt === 'string' ? row.updatedAt : nowIso(),
        updatedByAccountId: typeof row?.updatedByAccountId === 'string' ? row.updatedByAccountId : ''
      })),
      activeAccountId: parsed.activeAccountId ?? null,
      characters: (parsed.characters ?? []).map((row: any) => ({
        ...row,
        factionGroup: typeof row?.factionGroup === 'string' ? row.factionGroup : '',
        portraitRelativePath:
          typeof row?.portraitRelativePath === 'string' ? row.portraitRelativePath : ''
      }))
    }
  } catch {
    return { accounts: [], campaigns: [], battleStates: [], activeAccountId: null, characters: [] }
  }
}

function writeDb(data: CharacterDatabase): void {
  writeFileSync(dbPath(), JSON.stringify(data, null, 2), 'utf-8')
}

function nowIso(): string {
  return new Date().toISOString()
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `char-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function listCharacters(): CharacterRecord[] {
  return readDb().characters.slice()
}

export function listCharactersForContext(accountId: string, campaignId: string | null): CharacterRecord[] {
  return readDb()
    .characters.filter((row) => {
      if (campaignId) return row.campaignId === campaignId
      return row.ownerAccountId === accountId && row.campaignId == null
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function getCharacterById(id: string | null | undefined): CharacterRecord | null {
  if (!id || id === 'draft') return null
  return readDb().characters.find((row) => row.id === id) ?? null
}

export function getCampaignById(campaignId: string): CampaignRecord | null {
  return readDb().campaigns.find((row) => row.id === campaignId) ?? null
}

export function resolveAccountDisplayName(accountId: string | null | undefined): string {
  if (!accountId) return 'Someone'
  const account = readDb().accounts.find((row) => row.id === accountId)
  if (!account) return 'Unknown user'
  const name = account.displayName?.trim()
  return name && name.length > 0 ? name : account.email
}

export function saveCharacter(input: CharacterSaveInput): CharacterRecord {
  const db = readDb()
  const existingIdx = db.characters.findIndex((row) => row.id === input.id)
  const timestamp = nowIso()

  if (existingIdx >= 0) {
    const existing = db.characters[existingIdx]
    if (
      existing.portraitRelativePath &&
      input.portraitRelativePath !== undefined &&
      input.portraitRelativePath !== existing.portraitRelativePath
    ) {
      deletePortraitIfExists(existing.portraitRelativePath)
    }
    const updated: CharacterRecord = {
      ...existing,
      ...input,
      id: existing.id,
      createdAt: existing.createdAt,
      portraitRelativePath:
        input.portraitRelativePath !== undefined
          ? input.portraitRelativePath
          : existing.portraitRelativePath,
      updatedAt: timestamp
    }
    db.characters[existingIdx] = updated
    writeDb(db)
    return updated
  }

  const created: CharacterRecord = {
    ...input,
    portraitRelativePath: input.portraitRelativePath ?? '',
    id: input.id ?? newId(),
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const renamed = renameDraftPortrait(created.portraitRelativePath, created.id)
  if (renamed) created.portraitRelativePath = renamed
  db.characters.push(created)
  writeDb(db)
  return created
}

export function deleteCharacter(id: string): void {
  const db = readDb()
  const victim = db.characters.find((row) => row.id === id)
  if (victim?.portraitRelativePath) deletePortraitIfExists(victim.portraitRelativePath)
  const next = db.characters.filter((row) => row.id !== id)
  if (next.length !== db.characters.length) {
    writeDb({ ...db, characters: next })
  }
}

export function listAccounts(): UserAccount[] {
  return readDb()
    .accounts.map(
      ({ passwordHash: _passwordHash, resetToken: _resetToken, resetTokenExpiresAt: _exp, ...safe }) =>
        safe
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export function getActiveAccountId(): string | null {
  return readDb().activeAccountId
}

export function setActiveAccount(accountId: string): void {
  const db = readDb()
  if (!db.accounts.some((account) => account.id === accountId)) return
  db.activeAccountId = accountId
  writeDb(db)
}

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

function passwordIsStrong(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password)
  )
}

export function createAccount(input: {
  displayName: string
  email: string
  password: string
}): AuthResult {
  const db = readDb()
  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName.trim() || email.split('@')[0] || 'Player'
  const normalizedDisplayName = displayName.toLowerCase()
  if (!email.includes('@')) return { ok: false, message: 'Enter a valid email address.', account: null }
  if (!passwordIsStrong(input.password)) {
    return {
      ok: false,
      message: 'Password must be 8+ chars with upper, lower, and number.',
      account: null
    }
  }
  if (db.accounts.some((account) => account.email?.toLowerCase() === email)) {
    return { ok: false, message: 'An account with that email already exists.', account: null }
  }
  if (db.accounts.some((account) => account.displayName?.trim().toLowerCase() === normalizedDisplayName)) {
    return { ok: false, message: 'That username is already taken.', account: null }
  }

  const account: AccountRow = {
    id: `acct-${newId()}`,
    displayName,
    email,
    passwordHash: hashPassword(input.password),
    resetToken: null,
    resetTokenExpiresAt: null,
    createdAt: nowIso()
  }
  db.accounts.push(account)
  if (!db.activeAccountId) db.activeAccountId = account.id
  writeDb(db)
  const { passwordHash: _passwordHash, resetToken: _resetToken, resetTokenExpiresAt: _exp, ...safe } =
    account
  return { ok: true, message: 'Account created.', account: safe }
}

export function loginAccount(identifier: string, password: string): AuthResult {
  const normalized = identifier.trim().toLowerCase()
  if (
    normalized === DEV_ACCOUNT_EMAIL ||
    normalized === LEGACY_DEV_ACCOUNT_EMAIL ||
    normalized === DEV_ACCOUNT_DISPLAY_NAME.toLowerCase()
  ) {
    return loginDevMode(password)
  }

  const db = readDb()
  let account = db.accounts.find((row) => row.email?.toLowerCase() === normalized) ?? null
  if (!account) {
    const usernameMatches = db.accounts.filter((row) => row.displayName?.trim().toLowerCase() === normalized)
    if (usernameMatches.length > 1) {
      return {
        ok: false,
        message: 'Multiple accounts use that username. Sign in with your email instead.',
        account: null
      }
    }
    account = usernameMatches[0] ?? null
  }
  if (!account) return { ok: false, message: 'No account found for that email or username.', account: null }
  if (account.passwordHash !== hashPassword(password)) {
    return { ok: false, message: 'Incorrect password.', account: null }
  }
  db.activeAccountId = account.id
  writeDb(db)
  const { passwordHash: _passwordHash, resetToken: _resetToken, resetTokenExpiresAt: _exp, ...safe } =
    account
  return { ok: true, message: 'Logged in.', account: safe }
}

export function loginDevMode(password: string): AuthResult {
  if (password !== DEV_MODE_PASSWORD) {
    return { ok: false, message: 'Access denied.', account: null }
  }
  const db = readDb()
  const existing = db.accounts.find(
    (row) => row.email === DEV_ACCOUNT_EMAIL || row.email === LEGACY_DEV_ACCOUNT_EMAIL
  )
  if (existing) {
    if (existing.email !== DEV_ACCOUNT_EMAIL) existing.email = DEV_ACCOUNT_EMAIL
    if (existing.displayName !== DEV_ACCOUNT_DISPLAY_NAME) existing.displayName = DEV_ACCOUNT_DISPLAY_NAME
    existing.passwordHash = hashPassword(DEV_MODE_PASSWORD)
    db.activeAccountId = existing.id
    writeDb(db)
    const { passwordHash: _passwordHash, resetToken: _resetToken, resetTokenExpiresAt: _exp, ...safe } =
      existing
    return { ok: true, message: 'Access granted.', account: safe }
  }
  const account: AccountRow = {
    id: `acct-${newId()}`,
    displayName: DEV_ACCOUNT_DISPLAY_NAME,
    email: DEV_ACCOUNT_EMAIL,
    passwordHash: hashPassword(DEV_MODE_PASSWORD),
    resetToken: null,
    resetTokenExpiresAt: null,
    createdAt: nowIso()
  }
  db.accounts.push(account)
  db.activeAccountId = account.id
  writeDb(db)
  const { passwordHash: _passwordHash, resetToken: _resetToken, resetTokenExpiresAt: _exp, ...safe } =
    account
  return { ok: true, message: 'Access granted.', account: safe }
}

export function logoutActiveAccount(): SimpleResult {
  const db = readDb()
  db.activeAccountId = null
  writeDb(db)
  return { ok: true, message: 'Logged out.' }
}

export function requestPasswordReset(email: string): PasswordResetRequestResult {
  const db = readDb()
  const normalized = email.trim().toLowerCase()
  const account = db.accounts.find((row) => row.email?.toLowerCase() === normalized)
  if (!account) {
    return { ok: false, message: 'No account found for that email.', token: null }
  }
  const token = Math.random().toString(36).slice(2, 10).toUpperCase()
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  account.resetToken = token
  account.resetTokenExpiresAt = expires
  writeDb(db)
  return {
    ok: true,
    message: 'Reset token generated (local dev flow).',
    token
  }
}

export function resetPasswordWithToken(
  email: string,
  token: string,
  newPassword: string
): SimpleResult {
  if (!passwordIsStrong(newPassword)) {
    return { ok: false, message: 'New password must be 8+ chars with upper, lower, and number.' }
  }
  const db = readDb()
  const normalized = email.trim().toLowerCase()
  const account = db.accounts.find((row) => row.email?.toLowerCase() === normalized)
  if (!account) return { ok: false, message: 'No account found for that email.' }
  if (!account.resetToken || !account.resetTokenExpiresAt) {
    return { ok: false, message: 'No active reset token. Request one first.' }
  }
  if (account.resetToken !== token.trim().toUpperCase()) {
    return { ok: false, message: 'Reset token does not match.' }
  }
  if (new Date(account.resetTokenExpiresAt).getTime() < Date.now()) {
    return { ok: false, message: 'Reset token expired. Request a new one.' }
  }
  account.passwordHash = hashPassword(newPassword)
  account.resetToken = null
  account.resetTokenExpiresAt = null
  writeDb(db)
  return { ok: true, message: 'Password reset successful. You can now log in.' }
}

export function listCampaignsForAccount(accountId: string): CampaignRecord[] {
  return readDb()
    .campaigns.filter((campaign) => campaign.memberAccountIds.includes(accountId))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function listCampaignMembers(campaignId: string): UserAccount[] {
  const db = readDb()
  const campaign = db.campaigns.find((row) => row.id === campaignId)
  if (!campaign) return []
  const members = campaign.memberAccountIds
    .map((id) => db.accounts.find((account) => account.id === id))
    .filter(Boolean) as AccountRow[]
  return members.map(({ passwordHash: _p, resetToken: _t, resetTokenExpiresAt: _e, ...safe }) => safe)
}

export function leaveCampaign(accountId: string, campaignId: string): SimpleResult {
  const db = readDb()
  const campaign = db.campaigns.find((row) => row.id === campaignId)
  if (!campaign) return { ok: false, message: 'Campaign not found.' }
  if (!campaign.memberAccountIds.includes(accountId)) {
    return { ok: false, message: 'You are not in this campaign.' }
  }

  campaign.memberAccountIds = campaign.memberAccountIds.filter((id) => id !== accountId)

  if (campaign.ownerAccountId === accountId) {
    campaign.ownerAccountId = campaign.memberAccountIds[0] ?? ''
  }

  if (campaign.memberAccountIds.length === 0) {
    db.campaigns = db.campaigns.filter((row) => row.id !== campaignId)
    db.battleStates = db.battleStates.filter((row) => row.campaignId !== campaignId)
    db.characters = db.characters.map((row) =>
      row.campaignId === campaignId ? { ...row, campaignId: null } : row
    )
    writeDb(db)
    return { ok: true, message: 'You left. Campaign closed because no members remained.' }
  }

  writeDb(db)
  return { ok: true, message: 'You left the campaign.' }
}

export function createCampaign(accountId: string, name: string): CampaignRecord {
  const db = readDb()
  const campaign: CampaignRecord = {
    id: `camp-${newId()}`,
    code: Math.random().toString(36).slice(2, 8).toUpperCase(),
    name: name.trim(),
    ownerAccountId: accountId,
    memberAccountIds: [accountId],
    createdAt: nowIso()
  }
  db.campaigns.push(campaign)
  writeDb(db)
  return campaign
}

export function joinCampaignByCode(accountId: string, code: string): CampaignRecord | null {
  const db = readDb()
  const campaign = db.campaigns.find((row) => row.code.toUpperCase() === code.trim().toUpperCase())
  if (!campaign) return null
  if (!campaign.memberAccountIds.includes(accountId)) {
    campaign.memberAccountIds.push(accountId)
    writeDb(db)
  }
  return campaign
}

export function getCampaignBattleState(campaignId: string): CampaignBattleState | null {
  const db = readDb()
  return db.battleStates.find((row) => row.campaignId === campaignId) ?? null
}

export function saveCampaignBattleState(input: {
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
}): CampaignBattleState {
  const db = readDb()
  const now = nowIso()
  const normalized: CampaignBattleState = {
    campaignId: input.campaignId,
    participants: input.participants.filter((id, idx, arr) => arr.indexOf(id) === idx),
    drafts: input.drafts,
    round: Math.max(1, input.round),
    activeTurnIndex: Math.max(0, input.activeTurnIndex),
    updatedAt: now,
    updatedByAccountId: input.updatedByAccountId
  }
  const existingIdx = db.battleStates.findIndex((row) => row.campaignId === input.campaignId)
  if (existingIdx >= 0) {
    db.battleStates[existingIdx] = normalized
  } else {
    db.battleStates.push(normalized)
  }
  writeDb(db)
  return normalized
}

