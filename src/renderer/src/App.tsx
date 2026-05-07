import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import type { CampaignRecord, CharacterRecord, CharacterSaveInput } from '@shared/character-types'
import { createDefaultStats } from '@shared/character-types'
import { cn } from './lib/utils'
import { DndSheetSection, ecsPortraitSrc } from './components/DndSheetSection'
import { LoginUpdateLog } from './components/LoginUpdateLog'

type ThemeMode = 'system' | 'light' | 'dark'
type VisualStyle = 'clean' | 'parchment'
type AuthMode = 'login' | 'register' | 'dev' | 'reset'
type WorkspaceTab = 'sheet' | 'battle'
type ColorScheme = 'violet' | 'teal' | 'sunset'
type QuickPreset = 'frontliner' | 'caster' | 'rogue'
type RulesMode = 'ttrpg' | 'dnd'
type EditableCharacter = Omit<CharacterSaveInput, 'ownerAccountId' | 'campaignId'>
type BattleDraft = {
  hpCurrent: number
  armorCurrent: number
  initiative: number
  notes: string
  conditions: string[]
  selectedAction: string
}

const SESSION_TIMEOUT_MS = 20 * 60 * 1000
const DRAG_HINT_DISMISSED_KEY = 'ecs.dragHint.dismissed.v1'
const DND_CONDITIONS = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
  'Exhaustion'
] as const
const DND_ACTIONS = ['Attack', 'Dash', 'Disengage', 'Dodge', 'Help', 'Hide', 'Ready', 'Search', 'Use Object'] as const
const DND_CLASSES = [
  'Barbarian',
  'Bard',
  'Cleric',
  'Druid',
  'Fighter',
  'Monk',
  'Paladin',
  'Ranger',
  'Rogue',
  'Sorcerer',
  'Warlock',
  'Wizard'
] as const

const DND_CLASS_ABILITY: Record<string, keyof CharacterSaveInput['stats']> = {
  Barbarian: 'str',
  Bard: 'cha',
  Cleric: 'wis',
  Druid: 'wis',
  Fighter: 'str',
  Monk: 'dex',
  Paladin: 'cha',
  Ranger: 'dex',
  Rogue: 'dex',
  Sorcerer: 'cha',
  Warlock: 'cha',
  Wizard: 'int'
}
const DND_CLASS_BASELINE: Record<string, { hp: number; ac: number }> = {
  Barbarian: { hp: 14, ac: 14 },
  Bard: { hp: 10, ac: 13 },
  Cleric: { hp: 11, ac: 15 },
  Druid: { hp: 10, ac: 14 },
  Fighter: { hp: 12, ac: 16 },
  Monk: { hp: 10, ac: 15 },
  Paladin: { hp: 12, ac: 16 },
  Ranger: { hp: 11, ac: 15 },
  Rogue: { hp: 10, ac: 14 },
  Sorcerer: { hp: 8, ac: 13 },
  Warlock: { hp: 9, ac: 14 },
  Wizard: { hp: 8, ac: 12 }
}

function proficiencyBonus(level: number): number {
  if (level >= 17) return 6
  if (level >= 13) return 5
  if (level >= 9) return 4
  if (level >= 5) return 3
  return 2
}

function emptyCharacter(): EditableCharacter {
  return {
    id: undefined,
    portraitRelativePath: '',
    factionGroup: '',
    name: '',
    hpCurrent: 30,
    hpMax: 30,
    armorCurrent: 10,
    armorMax: 10,
    armorNote: '',
    dedicatedEssence: '',
    dedicatedEssenceDescription: '',
    traitName: '',
    traitDescription: '',
    epicMoveName: '',
    epicMoveDescription: '',
    monolithName: '',
    monolithDescription: '',
    archetype: '',
    level: 1,
    notes: '',
    keywords: [],
    stats: createDefaultStats(),
    attacks: []
  }
}

function parseKeywords(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((item, idx, arr) => arr.indexOf(item) === idx)
}

function formatSheet(ch: EditableCharacter): string {
  return `[${ch.name || 'Unnamed Character'}] - [H${ch.hpCurrent}/${ch.hpMax}]

[Normal Armor : ${ch.armorCurrent}/${ch.armorMax}]
[${ch.armorNote || ''}]

[Dedicated Essence : ${ch.dedicatedEssence || ''}]
${ch.dedicatedEssenceDescription || ''}

[Trait : ${ch.traitName || ''}]
${ch.traitDescription || ''}

[Epic/Ultimate Move: ${ch.epicMoveName || ''}]
${ch.epicMoveDescription || ''}

[Monolith : ${ch.monolithName || ''}] (One time, absurd feat / burst of power, like a super-super move)
${ch.monolithDescription || ''}`.trim()
}

function passwordChecks(password: string): { label: string; pass: boolean }[] {
  return [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'Contains uppercase letter', pass: /[A-Z]/.test(password) },
    { label: 'Contains lowercase letter', pass: /[a-z]/.test(password) },
    { label: 'Contains a number', pass: /\d/.test(password) }
  ]
}

export default function App(): JSX.Element {
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('clean')
  const [colorScheme, setColorScheme] = useState<ColorScheme>('violet')
  const [systemDark, setSystemDark] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authDisplayName, setAuthDisplayName] = useState('')
  const [devPassword, setDevPassword] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newResetPassword, setNewResetPassword] = useState('')
  const [resetTokenHint, setResetTokenHint] = useState<string | null>(null)
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [smtpMessage, setSmtpMessage] = useState<string | null>(null)
  const [showAdvancedAuthTools, setShowAdvancedAuthTools] = useState(false)

  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([])
  const [campaignMembers, setCampaignMembers] = useState<{ id: string; displayName: string; email: string }[]>(
    []
  )
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [newCampaignName, setNewCampaignName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('sheet')

  const [characters, setCharacters] = useState<CharacterRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditableCharacter>(emptyCharacter())
  const [keywordText, setKeywordText] = useState('')
  const [search, setSearch] = useState('')
  const [factionFilter, setFactionFilter] = useState<string>('all')
  const [appMessage, setAppMessage] = useState<string | null>(null)
  const [guidedSetup, setGuidedSetup] = useState(true)
  const [compactCreator, setCompactCreator] = useState(true)
  const [compactBattle, setCompactBattle] = useState(true)
  const [rulesMode, setRulesMode] = useState<RulesMode>('ttrpg')
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const [settingsPanelPos, setSettingsPanelPos] = useState<{ top: number; left: number } | null>(null)
  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickHp, setQuickHp] = useState(30)
  const [quickFaction, setQuickFaction] = useState('')
  const [quickClass, setQuickClass] = useState<(typeof DND_CLASSES)[number]>('Fighter')
  const [quickSubclass, setQuickSubclass] = useState('')
  const [quickPreset, setQuickPreset] = useState<QuickPreset>('frontliner')
  const [showAdvancedCharacterFields, setShowAdvancedCharacterFields] = useState(false)
  const [showAdvancedCampaignTools, setShowAdvancedCampaignTools] = useState(false)
  const [battleDrafts, setBattleDrafts] = useState<Record<string, BattleDraft>>({})
  const [battleParticipants, setBattleParticipants] = useState<string[]>([])
  const [dragCharacterId, setDragCharacterId] = useState<string | null>(null)
  const [showFirstDragHint, setShowFirstDragHint] = useState(false)
  const [encounterRound, setEncounterRound] = useState(1)
  const [activeTurnIndex, setActiveTurnIndex] = useState(0)
  const isApplyingRemoteBattleState = useRef(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => setSystemDark(media.matches)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  const darkMode = themeMode === 'system' ? systemDark : themeMode === 'dark'

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    // Keep initialization hook for future auth provider bootstrap.
  }, [])

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(DRAG_HINT_DISMISSED_KEY)
      setShowFirstDragHint(dismissed !== '1')
    } catch {
      setShowFirstDragHint(true)
    }
  }, [])

  useEffect(() => {
    if (!isAuthed || !activeAccountId) return
    const refresh = (): void => {
      void loadCampaigns(activeAccountId)
      void loadCharacters(activeAccountId, selectedCampaignId)
      if (selectedCampaignId) {
        void loadCampaignMembers(selectedCampaignId)
        void loadBattleState(selectedCampaignId)
      } else {
        setCampaignMembers([])
        setBattleParticipants([])
        setEncounterRound(1)
        setActiveTurnIndex(0)
      }
    }
    refresh()
  }, [isAuthed, activeAccountId, selectedCampaignId])

  useEffect(() => {
    setBattleDrafts((prev) => {
      const next: Record<string, BattleDraft> = {}
      for (const row of characters) {
        next[row.id] = prev[row.id] ?? {
          hpCurrent: row.hpCurrent,
          armorCurrent: row.armorCurrent,
          initiative: row.stats?.initiative ?? 0,
          notes: row.notes ?? '',
          conditions: [],
          selectedAction: ''
        }
      }
      return next
    })
  }, [characters])

  useEffect(() => {
    setBattleParticipants((prev) => prev.filter((id) => characters.some((row) => row.id === id)))
  }, [characters])

  useEffect(() => {
    if (battleParticipants.length === 0) {
      setActiveTurnIndex(0)
      return
    }
    if (activeTurnIndex >= battleParticipants.length) {
      setActiveTurnIndex(0)
    }
  }, [battleParticipants, activeTurnIndex])

  useEffect(() => {
    if (!isAuthed || !selectedCampaignId) return
    const timeout = setTimeout(() => {
      void persistBattleState(battleParticipants, battleDrafts, encounterRound, activeTurnIndex)
    }, 250)
    return () => clearTimeout(timeout)
  }, [isAuthed, selectedCampaignId, battleParticipants, battleDrafts, encounterRound, activeTurnIndex])

  useEffect(() => {
    if (!isAuthed || !activeAccountId) return
    const unsubscribe = window.syncApi.onChanged((payload) => {
      if (payload.scope === 'campaigns') {
        void loadCampaigns(activeAccountId)
        if (selectedCampaignId) void loadCampaignMembers(selectedCampaignId)
      }
      if (payload.scope === 'characters') {
        void loadCharacters(activeAccountId, selectedCampaignId)
      }
      if (payload.scope === 'battle' && selectedCampaignId && payload.campaignId === selectedCampaignId) {
        void loadBattleState(selectedCampaignId)
      }
    })
    return () => unsubscribe()
  }, [isAuthed, activeAccountId, selectedCampaignId])

  useEffect(() => {
    if (!isAuthed) return
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const resetTimer = (): void => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        void handleLogout('Session timed out due to inactivity.')
      }, SESSION_TIMEOUT_MS)
    }
    resetTimer()
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll']
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }))
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer))
    }
  }, [isAuthed])

  useEffect(() => {
    if (!showSettingsMenu) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setShowSettingsMenu(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showSettingsMenu])

  useLayoutEffect(() => {
    if (!showSettingsMenu) {
      setSettingsPanelPos(null)
      return
    }
    const panelWidth = 288
    const gap = 8
    const approxPanelHeight = 340
    const measure = (): void => {
      const el = settingsButtonRef.current
      let left: number
      let top: number
      if (!el) {
        left = Math.max(8, window.innerWidth - panelWidth - 16)
        top = 72
      } else {
        const rect = el.getBoundingClientRect()
        left = rect.right - panelWidth
        left = Math.min(Math.max(8, left), window.innerWidth - panelWidth - 8)
        top = rect.bottom + gap
        if (top + approxPanelHeight > window.innerHeight - 8) {
          top = rect.top - approxPanelHeight - gap
        }
        top = Math.min(Math.max(8, top), window.innerHeight - approxPanelHeight - 8)
      }
      setSettingsPanelPos({ top, left })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [showSettingsMenu])

  async function loadCampaigns(accountId: string): Promise<void> {
    const rows = await window.campaignApi.listForAccount(accountId)
    setCampaigns(rows)
  }

  async function loadCharacters(accountId: string, campaignId: string | null): Promise<void> {
    const rows = await window.characterApi.list({ accountId, campaignId })
    setCharacters(rows)
  }

  async function loadCampaignMembers(campaignId: string): Promise<void> {
    const members = await window.campaignApi.members(campaignId)
    setCampaignMembers(members)
  }

  async function loadBattleState(campaignId: string): Promise<void> {
    const state = await window.battleApi.getState(campaignId)
    isApplyingRemoteBattleState.current = true
    if (state) {
      setBattleParticipants(state.participants)
      setBattleDrafts(state.drafts)
      setEncounterRound(state.round)
      setActiveTurnIndex(state.activeTurnIndex)
    } else {
      setBattleParticipants([])
      setEncounterRound(1)
      setActiveTurnIndex(0)
    }
    setTimeout(() => {
      isApplyingRemoteBattleState.current = false
    }, 0)
  }

  async function persistBattleState(
    participants: string[],
    drafts: Record<string, BattleDraft>,
    round: number,
    turnIndex: number
  ): Promise<void> {
    if (!selectedCampaignId || !activeAccountId || isApplyingRemoteBattleState.current) return
    await window.battleApi.saveState({
      campaignId: selectedCampaignId,
      participants,
      drafts,
      round,
      activeTurnIndex: turnIndex,
      updatedByAccountId: activeAccountId
    })
  }

  async function handleLogout(message?: string): Promise<void> {
    await window.authApi.logout()
    setIsAuthed(false)
    setActiveAccountId(null)
    setSelectedCampaignId(null)
    setSelectedId(null)
    setEditor(emptyCharacter())
    setKeywordText('')
    setAppMessage(null)
    if (message) setAuthMessage(message)
  }

  async function handleAuthSubmit(): Promise<void> {
    setAuthMessage(null)
    if (authMode === 'dev') {
      const result = await window.authApi.devLogin(devPassword)
      setAuthMessage(result.message)
      if (!result.ok || !result.account) return
      setIsAuthed(true)
      setActiveAccountId(result.account.id)
      return
    }

    if (authMode === 'login') {
      const result = await window.authApi.login({ email: authEmail, password: authPassword })
      setAuthMessage(result.message)
      if (!result.ok || !result.account) return
      setIsAuthed(true)
      setActiveAccountId(result.account.id)
      return
    }

    if (authMode === 'register') {
      const result = await window.authApi.register({
        displayName: authDisplayName,
        email: authEmail,
        password: authPassword
      })
      setAuthMessage(result.message)
      if (!result.ok || !result.account) return
      setIsAuthed(true)
      setActiveAccountId(result.account.id)
      return
    }

    const result = await window.authApi.resetWithToken({
      email: authEmail,
      token: resetToken,
      newPassword: newResetPassword
    })
    setAuthMessage(result.message)
    if (result.ok) {
      setAuthMode('login')
      setResetToken('')
      setNewResetPassword('')
    }
  }

  async function handleRequestResetToken(): Promise<void> {
    const result = await window.authApi.requestReset(authEmail)
    setAuthMessage(result.message)
    setResetTokenHint(result.token ? `Local reset token: ${result.token}` : null)
  }

  async function handleSendTestEmail(): Promise<void> {
    if (!authEmail.trim()) {
      setAuthMessage('Enter an email first to send a test message.')
      return
    }
    const result = await window.authApi.sendTestEmail(authEmail.trim())
    setAuthMessage(result.message)
  }

  async function handleCheckSmtpStatus(): Promise<void> {
    const status = await window.authApi.smtpStatus()
    setSmtpMessage(status.message)
  }

  function openCharacter(record: CharacterRecord): void {
    setSelectedId(record.id)
    setEditor({
      id: record.id,
      portraitRelativePath: record.portraitRelativePath ?? '',
      factionGroup: record.factionGroup ?? '',
      name: record.name,
      hpCurrent: record.hpCurrent,
      hpMax: record.hpMax,
      armorCurrent: record.armorCurrent,
      armorMax: record.armorMax,
      armorNote: record.armorNote,
      dedicatedEssence: record.dedicatedEssence,
      dedicatedEssenceDescription: record.dedicatedEssenceDescription,
      traitName: record.traitName,
      traitDescription: record.traitDescription,
      epicMoveName: record.epicMoveName,
      epicMoveDescription: record.epicMoveDescription,
      monolithName: record.monolithName,
      monolithDescription: record.monolithDescription,
      archetype: record.archetype,
      level: record.level,
      notes: record.notes,
      keywords: record.keywords,
      stats: record.stats,
      attacks: record.attacks
    })
    setKeywordText(record.keywords.join(', '))
  }

  function newCharacter(): void {
    setSelectedId(null)
    setEditor(emptyCharacter())
    setKeywordText('')
  }

  function applyCharacterPreset(preset: 'frontliner' | 'caster' | 'rogue'): void {
    if (preset === 'frontliner') {
      setEditor((prev) => ({
        ...prev,
        archetype: 'Frontliner',
        factionGroup: prev.factionGroup || 'Vanguard',
        dedicatedEssence: prev.dedicatedEssence || 'Steel Discipline',
        hpMax: Math.max(prev.hpMax, 40),
        hpCurrent: Math.max(prev.hpCurrent, 40),
        armorMax: Math.max(prev.armorMax, 14),
        armorCurrent: Math.max(prev.armorCurrent, 14)
      }))
    } else if (preset === 'caster') {
      setEditor((prev) => ({
        ...prev,
        archetype: 'Caster',
        factionGroup: prev.factionGroup || 'Arc Circle',
        dedicatedEssence: prev.dedicatedEssence || 'Aether',
        hpMax: Math.max(prev.hpMax, 24),
        hpCurrent: Math.max(prev.hpCurrent, 24),
        armorMax: Math.max(prev.armorMax, 8),
        armorCurrent: Math.max(prev.armorCurrent, 8)
      }))
    } else {
      setEditor((prev) => ({
        ...prev,
        archetype: 'Rogue',
        factionGroup: prev.factionGroup || 'Night Guild',
        dedicatedEssence: prev.dedicatedEssence || 'Shadowstep',
        hpMax: Math.max(prev.hpMax, 28),
        hpCurrent: Math.max(prev.hpCurrent, 28),
        armorMax: Math.max(prev.armorMax, 10),
        armorCurrent: Math.max(prev.armorCurrent, 10)
      }))
    }
    setAppMessage(`Applied ${preset} preset.`)
  }

  function quickPresetDefaults(preset: QuickPreset): {
    archetype: string
    factionGroup: string
    dedicatedEssence: string
    armorMax: number
    armorCurrent: number
  } {
    if (preset === 'frontliner') {
      return {
        archetype: 'Frontliner',
        factionGroup: 'Vanguard',
        dedicatedEssence: 'Steel Discipline',
        armorMax: 14,
        armorCurrent: 14
      }
    }
    if (preset === 'caster') {
      return {
        archetype: 'Caster',
        factionGroup: 'Arc Circle',
        dedicatedEssence: 'Aether',
        armorMax: 8,
        armorCurrent: 8
      }
    }
    return {
      archetype: 'Rogue',
      factionGroup: 'Night Guild',
      dedicatedEssence: 'Shadowstep',
      armorMax: 10,
      armorCurrent: 10
    }
  }

  async function createQuickCharacter(): Promise<void> {
    if (!activeAccountId) return
    const name = quickName.trim()
    if (!name) {
      setAppMessage('Quick create needs a character name.')
      return
    }
    const hp = Math.max(1, Number(quickHp) || 1)
    const preset = quickPresetDefaults(quickPreset)
    const dndMode = rulesMode === 'dnd'
    const classBaseline = DND_CLASS_BASELINE[quickClass] ?? { hp, ac: 14 }
    const startingHp = dndMode ? Math.max(hp, classBaseline.hp) : hp
    const payload: CharacterSaveInput = {
      ...emptyCharacter(),
      name,
      hpCurrent: startingHp,
      hpMax: startingHp,
      factionGroup: quickFaction.trim() || (dndMode ? preset.factionGroup : ''),
      archetype: dndMode ? quickClass : '',
      dedicatedEssence: dndMode ? quickSubclass.trim() : '',
      armorCurrent: dndMode ? classBaseline.ac : 10,
      armorMax: dndMode ? classBaseline.ac : 10,
      ownerAccountId: activeAccountId,
      campaignId: selectedCampaignId,
      keywords: []
    }
    const saved = await window.characterApi.save(payload)
    await loadCharacters(activeAccountId, selectedCampaignId)
    openCharacter(saved)
    setShowQuickCreate(false)
    setQuickName('')
    setQuickHp(30)
    setQuickFaction('')
    setQuickClass('Fighter')
    setQuickSubclass('')
    setQuickPreset('frontliner')
    setAppMessage('Quick character created.')
  }

  async function pickCharacterPortrait(): Promise<void> {
    const prev = editor.portraitRelativePath?.trim() ?? ''
    const result = await window.portraitApi.choose({ characterId: editor.id ?? null })
    if (!result.ok || !result.portraitRelativePath) {
      if (result.message) setAppMessage(result.message)
      return
    }
    if (prev && prev !== result.portraitRelativePath) await window.portraitApi.remove(prev)
    setEditor((p) => ({ ...p, portraitRelativePath: result.portraitRelativePath ?? '' }))
    setAppMessage('Portrait updated — remember to save the character.')
  }

  async function clearCharacterPortrait(): Promise<void> {
    const prev = editor.portraitRelativePath?.trim() ?? ''
    if (!prev) return
    await window.portraitApi.remove(prev)
    setEditor((p) => ({ ...p, portraitRelativePath: '' }))
    setAppMessage('Portrait removed.')
  }

  async function saveCharacter(): Promise<void> {
    if (!activeAccountId) return
    const payload: CharacterSaveInput = {
      ...editor,
      ownerAccountId: activeAccountId,
      campaignId: selectedCampaignId,
      keywords: parseKeywords(keywordText)
    }
    const saved = await window.characterApi.save(payload)
    await loadCharacters(activeAccountId, selectedCampaignId)
    openCharacter(saved)
    setAppMessage('Character saved.')
  }

  async function deleteCharacter(): Promise<void> {
    if (!selectedId || !activeAccountId) return
    await window.characterApi.remove(selectedId)
    await loadCharacters(activeAccountId, selectedCampaignId)
    newCharacter()
    setAppMessage('Character deleted.')
  }

  async function generateAttacks(): Promise<void> {
    const result = await window.characterApi.generateAttacks({
      characterId: editor.id ?? 'draft',
      characterName: editor.name || 'Character',
      archetype: editor.archetype || editor.dedicatedEssence || 'adventurer',
      level: Math.max(1, editor.level),
      keywords: parseKeywords(keywordText),
      stats: editor.stats
    })
    setEditor((prev) => ({
      ...prev,
      attacks: [...prev.attacks.filter((attack) => attack.source !== 'generated'), ...result.attacks]
    }))
    setAppMessage('Generated attacks from keywords.')
  }

  async function createCampaign(): Promise<void> {
    if (!activeAccountId || !newCampaignName.trim()) return
    const campaign = await window.campaignApi.create({ accountId: activeAccountId, name: newCampaignName.trim() })
    setSelectedCampaignId(campaign.id)
    setNewCampaignName('')
    await loadCampaigns(activeAccountId)
  }

  async function joinCampaign(): Promise<void> {
    if (!activeAccountId || !joinCode.trim()) return
    const campaign = await window.campaignApi.joinByCode({ accountId: activeAccountId, code: joinCode.trim() })
    if (!campaign) {
      setAppMessage('Campaign code not found.')
      return
    }
    setSelectedCampaignId(campaign.id)
    setJoinCode('')
    await loadCampaigns(activeAccountId)
    await loadCampaignMembers(campaign.id)
    setWorkspaceTab('battle')
  }

  async function handleLeaveCampaign(): Promise<void> {
    if (!activeAccountId || !selectedCampaignId) return
    const result = await window.campaignApi.leave({
      accountId: activeAccountId,
      campaignId: selectedCampaignId
    })
    setAppMessage(result.message)
    setSelectedCampaignId(null)
    setWorkspaceTab('sheet')
    setCampaignMembers([])
    setBattleParticipants([])
    setBattleDrafts({})
    await loadCampaigns(activeAccountId)
    await loadCharacters(activeAccountId, null)
  }

  const filteredCharacters = useMemo(() => {
    const query = search.trim().toLowerCase()
    return characters.filter((row) => {
      const matchText = !query || row.name.toLowerCase().includes(query)
      const matchFaction =
        factionFilter === 'all' ? true : (row.factionGroup ?? '').trim().toLowerCase() === factionFilter
      return matchText && matchFaction
    })
  }, [characters, search, factionFilter])

  const factionOptions = useMemo(() => {
    const values = characters
      .map((row) => (row.factionGroup ?? '').trim().toLowerCase())
      .filter(Boolean)
      .filter((value, idx, arr) => arr.indexOf(value) === idx)
      .sort()
    return values
  }, [characters])

  const activeCampaign = campaigns.find((row) => row.id === selectedCampaignId) ?? null
  const preview = useMemo(() => formatSheet(editor), [editor])
  const pwdRules = passwordChecks(authPassword)
  const dndClass = DND_CLASSES.includes(editor.archetype as (typeof DND_CLASSES)[number])
    ? editor.archetype
    : 'Fighter'
  const dndCastingAbility = DND_CLASS_ABILITY[dndClass] ?? 'str'
  const dndAbilityScore = editor.stats[dndCastingAbility] ?? 10
  const dndAbilityMod = Math.floor((dndAbilityScore - 10) / 2)
  const dndProf = proficiencyBonus(editor.level)
  const dndSpellSaveDc = 8 + dndProf + dndAbilityMod
  const dndSpellAttack = dndProf + dndAbilityMod

  const cardClass =
    visualStyle === 'parchment'
      ? 'ecs-shape-card ecs-shape-soft motion-safe:transition-shadow motion-safe:duration-300 motion-safe:hover:shadow-lg motion-safe:hover:ring-1 motion-safe:hover:ring-amber-400/25 dark:motion-safe:hover:ring-amber-500/20 border-amber-300/70 bg-amber-50/95 dark:border-amber-600/30 dark:bg-[#302519] dark:text-amber-50'
      : 'ecs-shape-card ecs-shape-soft motion-safe:transition-shadow motion-safe:duration-300 motion-safe:hover:shadow-lg motion-safe:hover:ring-1 motion-safe:hover:ring-slate-300/60 dark:motion-safe:hover:ring-slate-600/50 border-slate-200/80 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95'
  const scheme = {
    violet: {
      grad: 'from-violet-600 via-indigo-600 to-fuchsia-600',
      primary: 'bg-violet-600',
      secondary: 'bg-indigo-600',
      ring: 'ring-violet-400/70'
    },
    teal: {
      grad: 'from-teal-600 via-cyan-600 to-emerald-600',
      primary: 'bg-teal-600',
      secondary: 'bg-cyan-600',
      ring: 'ring-teal-400/70'
    },
    sunset: {
      grad: 'from-orange-600 via-rose-600 to-amber-600',
      primary: 'bg-orange-600',
      secondary: 'bg-rose-600',
      ring: 'ring-orange-400/70'
    }
  }[colorScheme]

  function updateBattleDraft(
    characterId: string,
    patch: Partial<BattleDraft>
  ): void {
    setBattleDrafts((prev) => ({
      ...prev,
      [characterId]: {
        hpCurrent: prev[characterId]?.hpCurrent ?? 0,
        armorCurrent: prev[characterId]?.armorCurrent ?? 0,
        initiative: prev[characterId]?.initiative ?? 0,
        notes: prev[characterId]?.notes ?? '',
        conditions: prev[characterId]?.conditions ?? [],
        selectedAction: prev[characterId]?.selectedAction ?? '',
        ...patch
      }
    }))
  }

  function saveBattleRow(characterId: string): void {
    const base = characters.find((row) => row.id === characterId)
    if (!base) return
    setAppMessage(`Encounter state updated for ${base.name} (character sheet unchanged).`)
  }

  function moveParticipantToIndex(characterId: string, targetIndex: number): void {
    setBattleParticipants((prev) => {
      const currentIndex = prev.indexOf(characterId)
      if (currentIndex === -1) {
        if (showFirstDragHint) {
          setShowFirstDragHint(false)
          try {
            window.localStorage.setItem(DRAG_HINT_DISMISSED_KEY, '1')
          } catch {
            // ignore storage errors
          }
        }
        const next = [...prev]
        const clamped = Math.max(0, Math.min(targetIndex, next.length))
        next.splice(clamped, 0, characterId)
        return next
      }
      const next = [...prev]
      next.splice(currentIndex, 1)
      const clamped = Math.max(0, Math.min(targetIndex, next.length))
      next.splice(clamped, 0, characterId)
      return next
    })
  }

  function removeParticipant(characterId: string): void {
    setBattleParticipants((prev) => prev.filter((id) => id !== characterId))
  }

  function sortParticipantsByInitiative(): void {
    setBattleParticipants((prev) =>
      [...prev].sort((a, b) => {
        const ai = battleDrafts[a]?.initiative ?? 0
        const bi = battleDrafts[b]?.initiative ?? 0
        return bi - ai
      })
    )
  }

  function nextTurn(): void {
    if (battleParticipants.length === 0) return
    setActiveTurnIndex((prev) => {
      const next = prev + 1
      if (next >= battleParticipants.length) {
        setEncounterRound((round) => round + 1)
        return 0
      }
      return next
    })
  }

  function loadEncounterFromSheets(): void {
    const next: Record<string, BattleDraft> = {}
    for (const row of characters) {
      next[row.id] = {
        hpCurrent: row.hpCurrent,
        armorCurrent: row.armorCurrent,
        initiative: row.stats?.initiative ?? 0,
        notes: row.notes ?? '',
        conditions: [],
        selectedAction: ''
      }
    }
    setBattleDrafts(next)
    setEncounterRound(1)
    setActiveTurnIndex(0)
    setAppMessage('Encounter values reset from character sheets.')
  }

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl grid-rows-1 gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-soft motion-safe:animate-ecs-fade-up dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[1.1fr_0.9fr]">
          <section className={cn('flex min-h-0 flex-col rounded-2xl bg-gradient-to-br p-7 text-white', scheme.grad)}>
            <div className="shrink-0">
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-100">
                EPIC CHARACTER STORAGE
              </div>
              <h1 className="mt-4 text-4xl font-bold leading-tight">Welcome back</h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-violet-100">
                Build, organize, and run your campaign sheets in one place. Login is required each time you open the app.
              </p>
            </div>
            <LoginUpdateLog className="mt-6 min-h-0 flex-1" />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms] dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-2xl font-bold">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Use your account email and password.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {(['login', 'register'] as AuthMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAuthMode(mode)}
                  className={cn(
                    'ecs-interactive rounded-lg px-3 py-1.5 text-xs font-semibold uppercase motion-safe:active:scale-[0.98]',
                    authMode === mode
                      ? 'bg-violet-600 text-white'
                      : 'border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/60'
                  )}
                >
                  {mode}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowAdvancedAuthTools((prev) => !prev)}
                className="ecs-interactive rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase text-slate-600 hover:bg-slate-50 motion-safe:active:scale-[0.98] dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/60"
              >
                {showAdvancedAuthTools ? 'Hide tools' : 'More tools'}
              </button>
            </div>

            {showAdvancedAuthTools ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {(['reset', 'dev'] as AuthMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setAuthMode(mode)}
                    className={cn(
                      'ecs-interactive rounded-lg px-3 py-1.5 text-xs font-semibold uppercase motion-safe:active:scale-[0.98]',
                      authMode === mode
                        ? 'bg-violet-600 text-white'
                        : 'border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/60'
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            ) : null}

            {authMode === 'dev' ? (
              <div className="mt-4 space-y-2">
                <input
                  value={devPassword}
                  onChange={(event) => setDevPassword(event.target.value)}
                  type="password"
                  placeholder="Dev mode password"
                  className="w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Dev mode is password-only for quick local access.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {authMode === 'register' ? (
                  <input
                    value={authDisplayName}
                    onChange={(event) => setAuthDisplayName(event.target.value)}
                    placeholder="Display name"
                    className="w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700"
                  />
                ) : null}
                <input
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="Email"
                  className="w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700"
                />
                <input
                  value={authMode === 'reset' ? newResetPassword : authPassword}
                  onChange={(event) =>
                    authMode === 'reset'
                      ? setNewResetPassword(event.target.value)
                      : setAuthPassword(event.target.value)
                  }
                  type="password"
                  placeholder={authMode === 'reset' ? 'New password' : 'Password'}
                  className="w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700"
                />
                {authMode === 'reset' ? (
                  <button
                    type="button"
                    onClick={() => void handleRequestResetToken()}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700"
                  >
                    Request reset token
                  </button>
                ) : null}
                {authMode === 'reset' ? (
                  <input
                    value={resetToken}
                    onChange={(event) => setResetToken(event.target.value)}
                    placeholder="Reset token"
                    className="w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700"
                  />
                ) : null}
                {authMode === 'register' ? (
                  <ul className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700">
                    {pwdRules.map((rule) => (
                      <li key={rule.label} className={rule.pass ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}>
                        {rule.pass ? '✓' : '•'} {rule.label}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {showAdvancedAuthTools ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleSendTestEmail()}
                      className="w-full rounded-xl border border-sky-300 px-3 py-2 text-sm font-semibold text-sky-700 dark:border-sky-500/40 dark:text-sky-300"
                    >
                      Send test email
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCheckSmtpStatus()}
                      className="w-full rounded-xl border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 dark:border-indigo-500/40 dark:text-indigo-300"
                    >
                      Check email setup
                    </button>
                  </>
                ) : null}
                {smtpMessage ? (
                  <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {smtpMessage}
                  </p>
                ) : null}
                {resetTokenHint ? (
                  <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-100">
                    {resetTokenHint}
                  </p>
                ) : null}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleAuthSubmit()}
              className={cn(
                'mt-4 w-full rounded-xl px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:brightness-110 active:brightness-95 motion-safe:active:scale-[0.99]',
                scheme.primary
              )}
            >
              Continue
            </button>
            {authMessage ? <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{authMessage}</p> : null}
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className={cn('pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full opacity-25 blur-3xl', scheme.primary)} />
      <div className={cn('pointer-events-none absolute bottom-8 -left-20 h-64 w-64 rounded-full opacity-20 blur-3xl', scheme.secondary)} />
      <div className="pointer-events-none absolute inset-0 ecs-grid-wash opacity-70" />
      <div className="mx-auto max-w-7xl px-5 py-7">
        <header className="ecs-shape-banner ecs-diagonal-strip relative mb-6 rounded-3xl border border-violet-200/80 bg-white p-5 shadow-sm motion-safe:animate-ecs-fade-up dark:border-slate-800 dark:bg-slate-900">
          <div className="relative z-[1] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Campaign Manager</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Track characters, campaigns, and encounters.
              </p>
            </div>
            <div className="relative flex flex-wrap items-center gap-2">
              <button
                ref={settingsButtonRef}
                type="button"
                onClick={() => setShowSettingsMenu((prev) => !prev)}
                className="ecs-interactive rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold uppercase hover:bg-slate-50 active:brightness-95 dark:border-slate-700 dark:hover:bg-slate-800/70"
              >
                Settings
              </button>
              <button
                type="button"
                onClick={() => void handleLogout('Logged out.')}
                className="ecs-interactive rounded-lg border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 active:brightness-95 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap gap-2 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:55ms]">
          <div className="rounded-full border border-slate-300/80 bg-white/80 px-3 py-1 text-xs motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03] dark:border-slate-700 dark:bg-slate-900/60">
            Mode: <span className="font-semibold">{rulesMode === 'dnd' ? 'DnD' : 'TTRPG'}</span>
          </div>
          <div className="rounded-full border border-slate-300/80 bg-white/80 px-3 py-1 text-xs motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03] dark:border-slate-700 dark:bg-slate-900/60">
            Characters: <span className="font-semibold">{characters.length}</span>
          </div>
          <div className="rounded-full border border-slate-300/80 bg-white/80 px-3 py-1 text-xs motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03] dark:border-slate-700 dark:bg-slate-900/60">
            Campaign: <span className="font-semibold">{activeCampaign?.name ?? 'Personal'}</span>
          </div>
        </div>

        <div className="grid gap-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:110ms] lg:grid-cols-[300px_1fr]">
          <aside className={cn('rounded-3xl p-5 shadow-sm lg:sticky lg:top-5 lg:h-fit', cardClass)}>
            <h2 className="text-sm font-bold uppercase tracking-wide">Campaigns</h2>
            {guidedSetup ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Pick a campaign for shared play, or stay in personal mode.
              </p>
            ) : null}
            <select
              value={selectedCampaignId ?? ''}
              onChange={(event) => setSelectedCampaignId(event.target.value || null)}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
            >
              <option value="">Personal</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
            {activeCampaign ? (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-300">
                Share code: <span className="font-mono font-semibold">{activeCampaign.code}</span>
              </p>
            ) : null}
            {selectedCampaignId ? (
              <div className="mt-2 rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700">
                <div className="font-semibold">Campaign members</div>
                {campaignMembers.length === 0 ? (
                  <div className="mt-1 text-slate-500 dark:text-slate-400">No members loaded.</div>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {campaignMembers.map((member) => (
                      <li key={member.id}>
                        {member.displayName} <span className="text-slate-500">({member.email})</span>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => void handleLeaveCampaign()}
                  className="mt-2 w-full rounded-md border border-rose-300 px-2 py-1 font-semibold text-rose-700 dark:border-rose-500/40 dark:text-rose-300"
                >
                  Leave campaign
                </button>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setShowAdvancedCampaignTools((prev) => !prev)}
              className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
            >
              {showAdvancedCampaignTools ? 'Hide campaign tools' : 'Show campaign tools'}
            </button>
            {showAdvancedCampaignTools ? (
              <div className="mt-2">
                <input
                  value={newCampaignName}
                  onChange={(event) => setNewCampaignName(event.target.value)}
                  placeholder="Create campaign"
                  className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                />
                <button
                  type="button"
                  onClick={() => void createCampaign()}
                  className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition duration-150 hover:brightness-110 active:brightness-95 motion-safe:active:scale-[0.99]"
                >
                  Create
                </button>
                <div className="mt-2 flex gap-2">
                  <input
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value)}
                    placeholder="Join code"
                    className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => void joinCampaign()}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition duration-150 hover:brightness-110 active:brightness-95 motion-safe:active:scale-[0.99]"
                  >
                    Join
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
              <h3 className="text-sm font-bold uppercase tracking-wide">Characters</h3>
              {showFirstDragHint && selectedCampaignId && workspaceTab === 'battle' ? (
                <div className="mt-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-100">
                  First time? Drag any character card into the encounter area on the right.
                </div>
              ) : null}
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search..."
                className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
              />
              <select
                value={factionFilter}
                onChange={(event) => setFactionFilter(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
              >
                <option value="all">All factions</option>
                {factionOptions.map((faction) => (
                  <option key={faction} value={faction}>
                    {faction}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={newCharacter}
                className={cn(
                  'mt-2 w-full rounded-lg px-3 py-2 text-sm font-semibold text-white transition duration-150 hover:brightness-110 active:brightness-95 motion-safe:active:scale-[0.99]',
                  scheme.primary
                )}
              >
                New Character
              </button>
              <ul className="mt-3 space-y-2">
                {filteredCharacters.map((character) => (
                  <li key={character.id}>
                    <button
                      type="button"
                      draggable={Boolean(selectedCampaignId && workspaceTab === 'battle')}
                      onDragStart={() => setDragCharacterId(character.id)}
                      onDragEnd={() => setDragCharacterId(null)}
                      onClick={() => openCharacter(character)}
                      className={cn(
                        'flex w-full gap-2 rounded-lg border px-2 py-2 text-left motion-safe:transition-[border-color,box-shadow,background-color] motion-safe:duration-200 motion-safe:hover:shadow-md motion-safe:hover:border-slate-300 dark:motion-safe:hover:border-slate-600',
                        selectedId === character.id
                          ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/20'
                          : 'border-slate-200 dark:border-slate-700'
                      )}
                    >
                      {character.portraitRelativePath ? (
                        <span className="ecs-portrait-hex h-11 w-10 shrink-0 overflow-hidden bg-slate-200 dark:bg-slate-800">
                          <img
                            alt=""
                            src={ecsPortraitSrc(character.portraitRelativePath)}
                            className="h-full w-full object-cover"
                          />
                        </span>
                      ) : (
                        <span className="flex h-11 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400 dark:border-slate-600 dark:text-slate-500">
                          —
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">
                          {selectedCampaignId && workspaceTab === 'battle' ? (
                            <span className="mr-1 text-slate-400">::</span>
                          ) : null}
                          {character.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          H{character.hpCurrent}/{character.hpMax}
                          {character.factionGroup ? ` • ${character.factionGroup}` : ''}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <main className="space-y-5">
            <section className={cn('rounded-3xl p-4 shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-700/40', cardClass)}>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={newCharacter}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition duration-150 hover:brightness-110 active:brightness-95 motion-safe:active:scale-[0.98]',
                    scheme.primary
                  )}
                >
                  New
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuickCreate(true)}
                  className="ecs-interactive rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 motion-safe:active:scale-[0.98] dark:border-slate-700 dark:hover:bg-slate-800/50"
                >
                  Quick create
                </button>
                <button
                  type="button"
                  onClick={() => void saveCharacter()}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition duration-150 hover:brightness-110 active:brightness-95 motion-safe:active:scale-[0.98]',
                    scheme.secondary
                  )}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => void generateAttacks()}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition duration-150 hover:brightness-110 active:brightness-95 motion-safe:active:scale-[0.98]',
                    scheme.primary
                  )}
                >
                  Generate attacks
                </button>
                {rulesMode === 'dnd' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => applyCharacterPreset('frontliner')}
                      className="ecs-interactive rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 motion-safe:active:scale-[0.98] dark:border-slate-700 dark:hover:bg-slate-800/50"
                    >
                      Frontliner preset
                    </button>
                    <button
                      type="button"
                      onClick={() => applyCharacterPreset('caster')}
                      className="ecs-interactive rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 motion-safe:active:scale-[0.98] dark:border-slate-700 dark:hover:bg-slate-800/50"
                    >
                      Caster preset
                    </button>
                    <button
                      type="button"
                      onClick={() => applyCharacterPreset('rogue')}
                      className="ecs-interactive rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 motion-safe:active:scale-[0.98] dark:border-slate-700 dark:hover:bg-slate-800/50"
                    >
                      Rogue preset
                    </button>
                  </>
                ) : null}
                {selectedCampaignId ? (
                  <button
                    type="button"
                    onClick={() => setWorkspaceTab((prev) => (prev === 'sheet' ? 'battle' : 'sheet'))}
                    className="ecs-interactive rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 motion-safe:active:scale-[0.98] dark:border-slate-700 dark:hover:bg-slate-800/50"
                  >
                    {workspaceTab === 'sheet' ? 'Open battle tab' : 'Back to sheet'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setGuidedSetup((prev) => !prev)}
                  className="ecs-interactive rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 motion-safe:active:scale-[0.98] dark:border-slate-700 dark:hover:bg-slate-800/50"
                >
                  {guidedSetup ? 'Guided on' : 'Guided off'}
                </button>
                <button
                  type="button"
                  onClick={() => setCompactCreator((prev) => !prev)}
                  className="ecs-interactive rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 motion-safe:active:scale-[0.98] dark:border-slate-700 dark:hover:bg-slate-800/50"
                >
                  {compactCreator ? 'Creator compact' : 'Creator full'}
                </button>
                <button
                  type="button"
                  onClick={() => setCompactBattle((prev) => !prev)}
                  className="ecs-interactive rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 motion-safe:active:scale-[0.98] dark:border-slate-700 dark:hover:bg-slate-800/50"
                >
                  {compactBattle ? 'Battle compact' : 'Battle full'}
                </button>
                <div className="ml-auto rounded-full border border-slate-300/70 px-3 py-1 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {selectedCampaignId ? `Campaign: ${activeCampaign?.name ?? 'Unknown'}` : 'Personal workspace'}
                </div>
              </div>
            </section>

            <section className={cn('rounded-3xl p-4 shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-700/40', cardClass)}>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setWorkspaceTab('sheet')}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold uppercase transition duration-150 motion-safe:active:scale-[0.98]',
                    workspaceTab === 'sheet'
                      ? `${scheme.primary} text-white hover:brightness-110 active:brightness-95`
                      : 'ecs-interactive border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50'
                  )}
                >
                  Sheet
                </button>
                <button
                  type="button"
                  disabled={!selectedCampaignId}
                  onClick={() => setWorkspaceTab('battle')}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold uppercase transition duration-150 motion-safe:active:scale-[0.98]',
                    workspaceTab === 'battle'
                      ? `${scheme.secondary} text-white hover:brightness-110 active:brightness-95`
                      : 'ecs-interactive border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50',
                    !selectedCampaignId ? 'cursor-not-allowed opacity-50' : null
                  )}
                >
                  Battle
                </button>
              </div>
              {!selectedCampaignId ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Select a campaign to unlock battle tracking.
                </p>
              ) : null}
            </section>

            {workspaceTab === 'battle' && selectedCampaignId ? (
              <section className={cn('rounded-3xl p-5 shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-700/40', cardClass)}>
                <h2 className="text-lg font-semibold">Encounter Board</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Drag fighters from the left character list into this encounter board. Changes here do not
                  modify main sheets.
                </p>
                <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">
                  <span className="font-semibold">Drag & drop:</span> drag from the left list, drop here to
                  add, then drag encounter cards to reorder turn order.
                  {showFirstDragHint ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowFirstDragHint(false)
                        try {
                          window.localStorage.setItem(DRAG_HINT_DISMISSED_KEY, '1')
                        } catch {
                          // ignore storage errors
                        }
                      }}
                      className="ml-2 rounded border border-indigo-300 px-2 py-0.5 text-[11px] font-semibold text-indigo-800 dark:border-indigo-400/40 dark:text-indigo-100"
                    >
                      Got it
                    </button>
                  ) : null}
                </div>
                <div
                  className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (dragCharacterId) moveParticipantToIndex(dragCharacterId, battleParticipants.length)
                    setDragCharacterId(null)
                  }}
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Encounter controls
                  </div>
                  <button
                    type="button"
                    onClick={loadEncounterFromSheets}
                    className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
                  >
                    Reset encounter from sheets
                  </button>
                  <button
                    type="button"
                    onClick={sortParticipantsByInitiative}
                    className="mt-3 ml-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
                  >
                    Sort by initiative
                  </button>
                  <button
                    type="button"
                    onClick={nextTurn}
                    className={cn('mt-3 ml-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white', scheme.primary)}
                  >
                    Next turn
                  </button>
                  <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">Round {encounterRound}</span>
                </div>
                <div className="mt-3 space-y-3">
                  {battleParticipants.length === 0 ? (
                    <div
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault()
                        if (dragCharacterId) moveParticipantToIndex(dragCharacterId, 0)
                        setDragCharacterId(null)
                      }}
                      className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/40 px-3 py-5 text-sm text-slate-600 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-slate-300"
                    >
                      Drag characters from the left list and drop them here to begin this encounter.
                      <div className="mt-1 text-xs font-medium">
                        You can reorder active fighters by dragging their encounter cards.
                      </div>
                    </div>
                  ) : (
                    characters
                      .filter((character) => battleParticipants.includes(character.id))
                      .map((character) => {
                      const draft = battleDrafts[character.id] ?? {
                        hpCurrent: character.hpCurrent,
                        armorCurrent: character.armorCurrent,
                        initiative: character.stats?.initiative ?? 0,
                        notes: character.notes ?? '',
                        conditions: [],
                        selectedAction: ''
                      }
                      return (
                        <div
                          key={character.id}
                          draggable
                          onDragStart={() => setDragCharacterId(character.id)}
                          onDragEnd={() => setDragCharacterId(null)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault()
                            if (!dragCharacterId) return
                            const targetIndex = battleParticipants.indexOf(character.id)
                            if (targetIndex >= 0) moveParticipantToIndex(dragCharacterId, targetIndex)
                            setDragCharacterId(null)
                          }}
                          className={cn(
                            'cursor-grab rounded-xl border border-slate-200 p-3 active:cursor-grabbing dark:border-slate-700',
                            battleParticipants[activeTurnIndex] === character.id ? `ring-2 ${scheme.ring}` : ''
                          )}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold">
                              <span className="mr-1 text-slate-400">::</span>
                              {character.name}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeParticipant(character.id)}
                              className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
                            >
                              Remove
                            </button>
                          </div>
                          <div className={cn('grid gap-2', compactBattle ? 'md:grid-cols-6' : 'md:grid-cols-4')}>
                            <label className="text-xs">
                              HP
                              <div className="mt-1 flex items-center gap-1">
                                <button
                                  type="button"
                                  className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700"
                                  onClick={() => updateBattleDraft(character.id, { hpCurrent: draft.hpCurrent - 1 })}
                                >
                                  -1
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700"
                                  onClick={() => updateBattleDraft(character.id, { hpCurrent: draft.hpCurrent - 5 })}
                                >
                                  -5
                                </button>
                                <input
                                  type="number"
                                  value={draft.hpCurrent}
                                  onChange={(event) =>
                                    updateBattleDraft(character.id, {
                                      hpCurrent: Number(event.target.value || 0)
                                    })
                                  }
                                  className="w-full rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
                                />
                                <button
                                  type="button"
                                  className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700"
                                  onClick={() => updateBattleDraft(character.id, { hpCurrent: draft.hpCurrent + 1 })}
                                >
                                  +1
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700"
                                  onClick={() => updateBattleDraft(character.id, { hpCurrent: draft.hpCurrent + 5 })}
                                >
                                  +5
                                </button>
                              </div>
                            </label>
                            <label className="text-xs">
                              Armor
                              <input
                                type="number"
                                value={draft.armorCurrent}
                                onChange={(event) =>
                                  updateBattleDraft(character.id, {
                                    armorCurrent: Number(event.target.value || 0)
                                  })
                                }
                                className="mt-1 w-full rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
                              />
                            </label>
                            <label className="text-xs">
                              Initiative
                              <input
                                type="number"
                                value={draft.initiative}
                                onChange={(event) =>
                                  updateBattleDraft(character.id, {
                                    initiative: Number(event.target.value || 0)
                                  })
                                }
                                className="mt-1 w-full rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
                              />
                            </label>
                            <label className="text-xs">
                              Faction
                              <div className="mt-1 rounded border border-slate-200 px-2 py-1 dark:border-slate-700">
                                {character.factionGroup || 'None'}
                              </div>
                            </label>
                          </div>
                          {rulesMode === 'dnd' ? (
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              <label className="text-xs">
                                Turn action
                                <select
                                  value={draft.selectedAction}
                                  onChange={(event) =>
                                    updateBattleDraft(character.id, { selectedAction: event.target.value })
                                  }
                                  className="mt-1 w-full rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
                                >
                                  <option value="">No action selected</option>
                                  {DND_ACTIONS.map((action) => (
                                    <option key={action} value={action}>
                                      {action}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <div className="text-xs">
                                Conditions
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {DND_CONDITIONS.map((condition) => {
                                    const active = draft.conditions.includes(condition)
                                    return (
                                      <button
                                        key={condition}
                                        type="button"
                                        onClick={() =>
                                          updateBattleDraft(character.id, {
                                            conditions: active
                                              ? draft.conditions.filter((c) => c !== condition)
                                              : [...draft.conditions, condition]
                                          })
                                        }
                                        className={cn(
                                          'rounded border px-2 py-0.5 text-[11px]',
                                          active
                                            ? 'border-indigo-400 bg-indigo-500/15 text-indigo-900 dark:text-indigo-100'
                                            : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                                        )}
                                      >
                                        {condition}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {!compactBattle ? (
                            <label className="mt-2 block text-xs">
                              Battle notes
                              <textarea
                                rows={2}
                                value={draft.notes}
                                onChange={(event) =>
                                  updateBattleDraft(character.id, {
                                    notes: event.target.value
                                  })
                                }
                                className="mt-1 w-full rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
                              />
                            </label>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => saveBattleRow(character.id)}
                            className={cn('mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white', scheme.secondary)}
                          >
                            Save encounter row
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </section>
            ) : null}

            {workspaceTab === 'sheet' ? (
              rulesMode === 'dnd' ? (
                <DndSheetSection
                  cardClass={cardClass}
                  scheme={scheme}
                  editor={editor}
                  setEditor={setEditor}
                  keywordText={keywordText}
                  setKeywordText={setKeywordText}
                  onGenerateAttacks={() => void generateAttacks()}
                  onPickPortrait={() => void pickCharacterPortrait()}
                  onClearPortrait={() => void clearCharacterPortrait()}
                  dndClass={dndClass}
                  dndProf={dndProf}
                  dndSpellAttack={dndSpellAttack}
                  dndSpellSaveDc={dndSpellSaveDc}
                  dndCastingAbility={dndCastingAbility}
                  showAdvancedCharacterFields={showAdvancedCharacterFields}
                  setShowAdvancedCharacterFields={setShowAdvancedCharacterFields}
                />
              ) : (
            <section className={cn('rounded-2xl p-4 shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-700/40', cardClass)}>
              <h2 className="text-lg font-semibold">Character Details</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {guidedSetup
                  ? 'Start with the core fields. Expand advanced fields only when needed.'
                  : 'Clear, simplified inputs based on your original layout.'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                TTRPG mode — freeform fields with bracket export below.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void pickCharacterPortrait()}
                  className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold text-white', scheme.primary)}
                >
                  Portrait…
                </button>
                <button
                  type="button"
                  onClick={() => void clearCharacterPortrait()}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
                >
                  Clear portrait
                </button>
                {editor.portraitRelativePath ? (
                  <div className="ecs-portrait-hex h-14 w-12 shrink-0 overflow-hidden bg-slate-200 dark:bg-slate-800">
                    <img alt="" src={ecsPortraitSrc(editor.portraitRelativePath)} className="h-full w-full object-cover" />
                  </div>
                ) : null}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <input
                  value={editor.name}
                  onChange={(event) => setEditor((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Character name"
                  className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                />
                <input
                  type="number"
                  value={editor.hpCurrent}
                  onChange={(event) =>
                    setEditor((prev) => ({ ...prev, hpCurrent: Number(event.target.value || 0) }))
                  }
                  placeholder="HP current"
                  className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                />
                <input
                  type="number"
                  value={editor.hpMax}
                  onChange={(event) =>
                    setEditor((prev) => ({ ...prev, hpMax: Number(event.target.value || 0) }))
                  }
                  placeholder="HP max"
                  className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                />
                {!compactCreator ? (
                  <>
                    <input
                      value={editor.factionGroup}
                      onChange={(event) =>
                        setEditor((prev) => ({ ...prev, factionGroup: event.target.value }))
                      }
                      placeholder="Faction group (e.g. Iron Vanguard)"
                      className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                    />
                    <input
                      value={editor.dedicatedEssence}
                      onChange={(event) =>
                        setEditor((prev) => ({ ...prev, dedicatedEssence: event.target.value }))
                      }
                      placeholder="Dedicated essence"
                      className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                    />
                  </>
                ) : null}
              </div>
              {compactCreator ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Compact creator hides optional fields. Switch to Creator full for faction and essence inputs.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setShowAdvancedCharacterFields((prev) => !prev)}
                className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
              >
                {showAdvancedCharacterFields ? 'Hide advanced fields' : 'Show advanced fields'}
              </button>
              {showAdvancedCharacterFields ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={editor.traitDescription}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, traitDescription: event.target.value }))
                    }
                    placeholder="Trait description"
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                  />
                  <textarea
                    value={editor.epicMoveDescription}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, epicMoveDescription: event.target.value }))
                    }
                    placeholder="Epic/Ultimate move description"
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                  />
                  <textarea
                    value={editor.monolithDescription}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, monolithDescription: event.target.value }))
                    }
                    placeholder="Monolith description"
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                  />
                </div>
              ) : null}
            </section>
              )
            ) : null}

            {workspaceTab === 'sheet' && rulesMode === 'ttrpg' ? (
            <section className={cn('rounded-2xl p-4 shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-700/40', cardClass)}>
              <h2 className="text-lg font-semibold">Attacks</h2>
              <input
                value={keywordText}
                onChange={(event) => setKeywordText(event.target.value)}
                placeholder="Keywords: fire, shadow, arcane"
                className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
              />
              <button
                type="button"
                onClick={() => void generateAttacks()}
                className={cn('mt-2 rounded-lg px-3 py-2 text-sm font-semibold text-white', scheme.secondary)}
              >
                Generate from keywords
              </button>
              <ul className="mt-2 space-y-2">
                {editor.attacks.map((attack) => (
                  <li key={attack.id} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                    <div className="text-sm font-semibold">{attack.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {attack.damageDice} {attack.damageType} | +{attack.hitBonus} | {attack.range}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            ) : null}

            {workspaceTab === 'sheet' ? (
            <section className={cn('rounded-2xl p-4 shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-700/40', cardClass)}>
              <h2 className="text-lg font-semibold">Sheet Preview</h2>
              <textarea
                readOnly
                value={preview}
                rows={10}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950/60"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void saveCharacter()}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => void deleteCharacter()}
                  className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 dark:border-rose-500/40 dark:text-rose-300"
                >
                  Delete
                </button>
              </div>
            </section>
            ) : null}
          </main>
        </div>

        {showQuickCreate ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4">
            <div className={cn('w-full max-w-md rounded-2xl border p-4 shadow-xl', cardClass)}>
              <h3 className="text-lg font-semibold">Quick Create Character</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Add a session-ready character in a few fields.
              </p>
              <div className="mt-3 space-y-2">
                <input
                  value={quickName}
                  onChange={(event) => setQuickName(event.target.value)}
                  placeholder="Character name"
                  className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={1}
                    value={quickHp}
                    onChange={(event) => setQuickHp(Number(event.target.value || 1))}
                    placeholder="Starting HP"
                    className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                  />
                  {rulesMode === 'dnd' ? (
                    <select
                      value={quickClass}
                      onChange={(event) => setQuickClass(event.target.value as (typeof DND_CLASSES)[number])}
                      className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                    >
                      {DND_CLASSES.map((klass) => (
                        <option key={klass} value={klass}>
                          {klass}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={quickPreset}
                      onChange={(event) => setQuickPreset(event.target.value as QuickPreset)}
                      className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                    >
                      <option value="frontliner">Frontliner preset</option>
                      <option value="caster">Caster preset</option>
                      <option value="rogue">Rogue preset</option>
                    </select>
                  )}
                </div>
                {rulesMode === 'dnd' ? (
                  <input
                    value={quickSubclass}
                    onChange={(event) => setQuickSubclass(event.target.value)}
                    placeholder="Subclass / Oath / Circle (optional)"
                    className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                  />
                ) : null}
                <input
                  value={quickFaction}
                  onChange={(event) => setQuickFaction(event.target.value)}
                  placeholder="Faction group (optional)"
                  className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                />
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickCreate(false)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void createQuickCharacter()}
                  className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold text-white', scheme.primary)}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {appMessage ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
            {appMessage}
          </div>
        ) : null}
      </div>

      {showSettingsMenu && settingsPanelPos
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Close settings"
                className="fixed inset-0 z-[50000] cursor-default bg-slate-950/30 motion-safe:animate-ecs-backdrop-in"
                onClick={() => setShowSettingsMenu(false)}
              />
              <div
                role="dialog"
                aria-label="Workspace settings"
                className={cn(
                  'fixed z-[50001] w-72 origin-top-right rounded-xl border p-3 shadow-xl motion-safe:animate-ecs-pop-in',
                  cardClass
                )}
                style={{ top: settingsPanelPos.top, left: settingsPanelPos.left }}
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Workspace Settings
                </div>
                <label className="mt-2 block text-xs">
                  Mode
                  <select
                    value={rulesMode}
                    onChange={(event) => setRulesMode(event.target.value as RulesMode)}
                    className="mt-1 w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                  >
                    <option value="ttrpg">TTRPG mode</option>
                    <option value="dnd">DnD mode</option>
                  </select>
                </label>
                <label className="mt-2 block text-xs">
                  Color scheme
                  <select
                    value={colorScheme}
                    onChange={(event) => setColorScheme(event.target.value as ColorScheme)}
                    className="mt-1 w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                  >
                    <option value="violet">Violet</option>
                    <option value="teal">Teal</option>
                    <option value="sunset">Sunset</option>
                  </select>
                </label>
                <label className="mt-2 block text-xs">
                  Theme
                  <select
                    value={themeMode}
                    onChange={(event) => setThemeMode(event.target.value as ThemeMode)}
                    className="mt-1 w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
                <label className="mt-2 block text-xs">
                  Visual style
                  <select
                    value={visualStyle}
                    onChange={(event) => setVisualStyle(event.target.value as VisualStyle)}
                    className="mt-1 w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                  >
                    <option value="clean">Clean</option>
                    <option value="parchment">Parchment</option>
                  </select>
                </label>
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  )
}

