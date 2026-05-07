export type CharacterStats = {
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
  hp: number
  ac: number
  initiative: number
}

export type AttackSource = 'manual' | 'generated'

export type CharacterAttack = {
  id: string
  name: string
  hitBonus: number
  damageDice: string
  damageType: string
  range: string
  tags: string[]
  description: string
  source: AttackSource
}

export type CharacterRecord = {
  id: string
  ownerAccountId: string
  campaignId: string | null
  /** Relative to app userData, e.g. portraits/uuid.png — displayed via ecs-portrait:// protocol */
  portraitRelativePath: string
  factionGroup: string
  name: string
  hpCurrent: number
  hpMax: number
  armorCurrent: number
  armorMax: number
  armorNote: string
  dedicatedEssence: string
  dedicatedEssenceDescription: string
  traitName: string
  traitDescription: string
  epicMoveName: string
  epicMoveDescription: string
  monolithName: string
  monolithDescription: string
  archetype: string
  level: number
  notes: string
  keywords: string[]
  stats: CharacterStats
  attacks: CharacterAttack[]
  createdAt: string
  updatedAt: string
}

export type CharacterSaveInput = Omit<CharacterRecord, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string
}

export type UserAccount = {
  id: string
  displayName: string
  email: string
  createdAt: string
}

export type AuthResult = {
  ok: boolean
  message: string
  account: UserAccount | null
}

export type SimpleResult = {
  ok: boolean
  message: string
}

export type PasswordResetRequestResult = SimpleResult & {
  token: string | null
}

export type SmtpStatusResult = {
  ok: boolean
  configured: boolean
  message: string
  missing: string[]
}

export type CampaignRecord = {
  id: string
  name: string
  code: string
  ownerAccountId: string
  memberAccountIds: string[]
  createdAt: string
}

export type GeneratedAttackResult = {
  attacks: CharacterAttack[]
  matchedKeywords: string[]
  generationNotes: string[]
}

export type BattleDraftRow = {
  hpCurrent: number
  armorCurrent: number
  initiative: number
  notes: string
  conditions: string[]
  selectedAction: string
}

export type CampaignBattleState = {
  campaignId: string
  participants: string[]
  drafts: Record<string, BattleDraftRow>
  round: number
  activeTurnIndex: number
  updatedAt: string
  updatedByAccountId: string
}

export function createDefaultStats(): CharacterStats {
  return {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
    hp: 12,
    ac: 12,
    initiative: 0
  }
}

