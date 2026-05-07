import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
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
type ColorScheme = 'default' | 'violet' | 'teal' | 'sunset' | 'wii' | 'xmb' | 'cube' | 'wiiu' | '3ds'
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

function ecsAuthControlRound(cs: ColorScheme): string {
  if (cs === 'teal') return 'rounded-md'
  if (cs === 'wii') return 'rounded-2xl'
  if (cs === 'wiiu') return 'rounded-xl'
  if (cs === '3ds') return 'rounded-md'
  if (cs === 'default') return 'rounded-lg'
  return 'rounded-lg'
}

function ecsWideControlRound(cs: ColorScheme): string {
  if (cs === 'teal') return 'rounded-md'
  if (cs === 'wii') return 'rounded-2xl'
  if (cs === 'wiiu') return 'rounded-xl'
  if (cs === '3ds') return 'rounded-md'
  if (cs === 'default') return 'rounded-lg'
  return 'rounded-xl'
}

function ecsCharacterRowRound(cs: ColorScheme): string {
  if (cs === 'teal') return 'rounded-md'
  if (cs === 'wii') return 'rounded-2xl'
  if (cs === 'wiiu') return 'rounded-xl'
  if (cs === '3ds') return 'rounded-md'
  if (cs === 'default') return 'rounded-lg'
  return 'rounded-lg'
}

function SettingsLabel({ children, hint }: { children: ReactNode; hint: string }): JSX.Element {
  return (
    <span className="ecs-tooltip-label inline-flex items-center gap-1.5">
      {children}
      <span
        className="ecs-tooltip-trigger relative inline-flex h-4 w-4 cursor-help select-none items-center justify-center rounded-full border border-slate-400/80 bg-slate-100 text-[9px] font-bold leading-none text-slate-600 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-300"
        tabIndex={0}
        role="img"
        aria-label={hint}
      >
        ?
        <span className="ecs-tooltip-bubble" role="tooltip">
          {hint}
        </span>
      </span>
    </span>
  )
}

export default function App(): JSX.Element {
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('clean')
  const [colorScheme, setColorScheme] = useState<ColorScheme>('default')
  const [useThemeLayout, setUseThemeLayout] = useState<boolean>(true)
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
  const currentMonth = new Date().getMonth() + 1

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    document.documentElement.dataset.ecsPalette = colorScheme
    document.documentElement.dataset.ecsTone = darkMode ? 'dark' : 'light'
    document.documentElement.dataset.ecsMonth = String(currentMonth)
    document.documentElement.dataset.ecsLayout = useThemeLayout ? 'themed' : 'default'
  }, [colorScheme, darkMode, currentMonth, useThemeLayout])

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

  const loginMutedBtn = useMemo(() => {
    if (colorScheme === 'default') {
      return darkMode
        ? 'border border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700/90'
        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
    }
    if (colorScheme === 'teal') {
      return cn(
        'border border-gray-700 bg-[#d4d0c8] text-gray-900 hover:bg-[#c8c4bc]',
        'dark:border-gray-900 dark:bg-[#4a4a4a] dark:text-gray-100 dark:hover:bg-[#555]'
      )
    }
    if (colorScheme === 'sunset') {
      return darkMode
        ? 'border border-cyan-500/35 bg-slate-950/55 text-slate-200 hover:bg-slate-900/75'
        : 'border-2 border-pink-300 bg-white/80 text-indigo-950 hover:bg-white'
    }
    if (colorScheme === 'wii') {
      return darkMode
        ? 'border border-gray-600 bg-gray-700/85 text-gray-100 hover:bg-gray-600/95'
        : 'border border-gray-400/85 bg-white/82 text-gray-800 hover:bg-white'
    }
    if (colorScheme === 'xmb') {
      return 'border border-slate-600/70 bg-slate-800/65 text-slate-200 hover:bg-slate-700/85'
    }
    if (colorScheme === 'cube') {
      return darkMode
        ? 'border border-indigo-400/45 bg-indigo-950/60 text-indigo-100 hover:bg-indigo-900/70'
        : 'border border-indigo-400/55 bg-white/90 text-indigo-950 hover:bg-white'
    }
    if (colorScheme === 'wiiu') {
      return darkMode
        ? 'border border-cyan-500/35 bg-slate-900/72 text-cyan-100 hover:bg-slate-800/80'
        : 'border border-cyan-300/70 bg-white/86 text-cyan-900 hover:bg-white'
    }
    if (colorScheme === '3ds') {
      return darkMode
        ? 'border border-rose-500/35 bg-zinc-900/82 text-rose-100 hover:bg-zinc-800/90'
        : 'border border-rose-300/80 bg-white/90 text-rose-900 hover:bg-white'
    }
    return 'border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/60'
  }, [colorScheme, darkMode])

  const scheme = useMemo(
    () =>
      (
        {
          default: {
            grad: darkMode ? 'from-slate-950 via-slate-900 to-slate-950' : 'from-slate-50 via-white to-slate-100',
            primary: darkMode
              ? 'rounded-lg bg-slate-100 text-slate-900 font-semibold border border-slate-300/40 shadow-sm hover:bg-white'
              : 'rounded-lg bg-slate-900 text-white font-semibold border border-slate-800 shadow-sm hover:bg-slate-800',
            secondary: darkMode
              ? 'rounded-lg bg-slate-800 text-slate-100 font-semibold border border-slate-600/45 shadow-sm hover:bg-slate-700'
              : 'rounded-lg bg-slate-200 text-slate-900 font-semibold border border-slate-300 shadow-sm hover:bg-slate-100',
            ring: darkMode ? 'ring-slate-300/55' : 'ring-slate-500/55'
          },
          violet: {
            grad: 'from-sky-500 via-teal-500 to-lime-400',
            primary:
              'bg-gradient-to-b from-sky-400 to-sky-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] border border-sky-600/40',
            secondary:
              'bg-gradient-to-b from-teal-400 to-teal-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] border border-teal-700/35',
            ring: 'ring-sky-400/75'
          },
          teal: {
            grad: darkMode
              ? 'from-[#000022] via-[#003d5c] to-[#006565]'
              : 'from-[#000080] via-[#1084d0] to-[#008080]',
            primary: darkMode
              ? 'rounded-md bg-[#6f6f6f] text-white font-semibold shadow-[inset_-1px_-1px_0_#2f2f2f,inset_1px_1px_0_#a0a0a0] border border-black/35'
              : 'rounded-md bg-[#ece9d8] text-[#000060] font-semibold shadow-[inset_-1px_-1px_0_#404040,inset_1px_1px_0_#ffffff] border border-black/25',
            secondary: darkMode
              ? 'rounded-md bg-[#5c5c5c] text-[#ecfeff] font-semibold shadow-[inset_-1px_-1px_0_#252525,inset_1px_1px_0_#888888] border border-black/35'
              : 'rounded-md bg-[#d8d4c8] text-[#003049] font-semibold shadow-[inset_-1px_-1px_0_#505050,inset_1px_1px_0_#ffffff] border border-black/22',
            ring: 'ring-[#1084d0]/70'
          },
          sunset: {
            grad: darkMode
              ? 'from-[#3b0764] via-[#86198f] to-[#155e75]'
              : 'from-[#fffbeb] via-[#fbcfe8] to-[#a5f3fc]',
            primary: darkMode
              ? 'rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-cyan-500 text-white font-semibold border border-fuchsia-400/55 shadow-[0_0_26px_rgba(217,70,239,0.42)]'
              : 'rounded-xl bg-gradient-to-r from-pink-500 via-fuchsia-600 to-orange-400 text-white font-semibold border-2 border-white/70 shadow-[0_10px_36px_rgba(219,39,119,0.35)]',
            secondary: darkMode
              ? 'rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold border border-cyan-300/40 shadow-[0_0_22px_rgba(34,211,238,0.35)]'
              : 'rounded-xl bg-gradient-to-r from-sky-400 to-violet-600 text-white font-semibold border-2 border-cyan-200/80 shadow-lg',
            ring: 'ring-fuchsia-400/75'
          },
          wii: {
            grad: darkMode ? 'from-[#353943] via-[#4a505c] to-[#252830]' : 'from-[#f4f6fa] via-[#dce2ec] to-[#b9c2d1]',
            primary:
              'rounded-2xl bg-gradient-to-b from-[#7dd3fc] to-[#0284c7] text-white font-semibold border border-white/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_10px_28px_rgba(2,132,199,0.35)]',
            secondary:
              'rounded-2xl bg-gradient-to-b from-[#94a3b8] to-[#475569] text-white font-semibold border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]',
            ring: 'ring-sky-400/80'
          },
          xmb: {
            grad: 'from-[#0c1628] via-[#152238] to-[#050910]',
            primary:
              'rounded-lg bg-gradient-to-r from-sky-400 to-blue-700 text-white font-semibold border border-sky-300/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_24px_rgba(56,189,248,0.22)]',
            secondary:
              'rounded-lg bg-gradient-to-b from-slate-600 to-slate-900 text-slate-50 font-semibold border border-slate-500/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]',
            ring: 'ring-sky-400/70'
          },
          cube: {
            grad: darkMode
              ? 'from-[#060a19] via-[#1e3a8a] to-[#0f172a]'
              : 'from-[#1e3a8a] via-[#3730a3] to-[#0f172a]',
            primary:
              'rounded-xl bg-gradient-to-r from-indigo-300 via-slate-100 to-indigo-200 text-indigo-950 font-bold border border-white/80 shadow-[0_0_28px_rgba(129,140,248,0.32)]',
            secondary:
              'rounded-xl bg-gradient-to-r from-indigo-700 to-slate-900 text-slate-100 font-semibold border border-indigo-300/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]',
            ring: 'ring-indigo-300/80'
          },
          wiiu: {
            grad: darkMode ? 'from-[#031525] via-[#0f2f3d] to-[#111827]' : 'from-[#e0f7ff] via-[#dbeafe] to-[#cffafe]',
            primary:
              'rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 text-white font-semibold border border-cyan-200/60 shadow-[0_8px_24px_rgba(14,116,144,0.28)]',
            secondary:
              'rounded-xl bg-gradient-to-r from-slate-500 to-slate-700 text-white font-semibold border border-slate-300/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
            ring: 'ring-cyan-300/75'
          },
          '3ds': {
            grad: darkMode ? 'from-[#3f0a0a] via-[#18181b] to-[#7f1d1d]' : 'from-[#fff1f2] via-[#ffe4e6] to-[#fee2e2]',
            primary:
              'rounded-md bg-gradient-to-b from-rose-500 to-rose-700 text-white font-semibold border border-rose-300/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]',
            secondary:
              'rounded-md bg-gradient-to-b from-zinc-500 to-zinc-700 text-white font-semibold border border-zinc-300/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
            ring: 'ring-rose-300/75'
          }
        } as const
      )[colorScheme],
    [colorScheme, darkMode]
  )

  const headerChrome = useMemo(() => {
    if (colorScheme === 'default') {
      return cn(
        'relative mb-6 rounded-2xl border p-5 motion-safe:animate-ecs-fade-up',
        darkMode
          ? 'border-slate-700 bg-slate-900 text-slate-100 shadow-sm'
          : 'border-slate-200 bg-white text-slate-900 shadow-sm'
      )
    }
    if (colorScheme === 'teal') {
      return cn(
        'ecs-win98-window relative mb-6 rounded-md border border-black/55 p-5 pt-6 motion-safe:animate-ecs-fade-up',
        darkMode ? 'border-black/60 bg-[#545454] text-zinc-100 shadow-[4px_4px_0_rgba(0,0,0,0.35)]' : 'bg-[#ece9d8] text-gray-900 shadow-[4px_4px_0_rgba(0,0,0,0.12)]'
      )
    }
    if (colorScheme === 'sunset') {
      return cn(
        'ecs-shape-banner relative mb-6 rounded-[1.35rem] border-2 p-5 backdrop-blur-md motion-safe:animate-ecs-fade-up ecs-header-y2k',
        darkMode
          ? 'border-cyan-400/50 bg-slate-950/88 text-slate-100 shadow-[0_0_38px_rgba(34,211,238,0.14)]'
          : 'border-pink-400/80 bg-gradient-to-br from-amber-50 via-white to-fuchsia-100 text-indigo-950 shadow-xl'
      )
    }
    if (colorScheme === 'wii') {
      return cn(
        'relative mb-6 rounded-[2rem] border p-5 motion-safe:animate-ecs-fade-up backdrop-blur-md',
        darkMode
          ? 'border-gray-600/55 bg-gray-800/92 text-gray-100 shadow-[0_14px_44px_rgba(0,0,0,0.38)]'
          : 'border-white/75 bg-white/88 text-gray-900 shadow-[0_16px_48px_rgba(15,23,42,0.08)]'
      )
    }
    if (colorScheme === 'xmb') {
      return cn(
        'relative mb-6 rounded-xl border border-slate-700/60 bg-gradient-to-b from-slate-900/96 to-slate-950/98 p-5 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] motion-safe:animate-ecs-fade-up',
        !darkMode && 'from-slate-800/96 to-slate-900/98 text-slate-50'
      )
    }
    if (colorScheme === 'cube') {
      return cn(
        'relative mb-6 rounded-[1.1rem] border border-indigo-300/35 bg-gradient-to-r from-[#1f2a44]/96 via-[#1e3a8a]/82 to-[#0f172a]/94 p-5 text-slate-100 shadow-[0_0_26px_rgba(129,140,248,0.2)] motion-safe:animate-ecs-fade-up'
      )
    }
    if (colorScheme === 'wiiu') {
      return cn(
        'relative mb-6 rounded-2xl border p-5 backdrop-blur-md motion-safe:animate-ecs-fade-up',
        darkMode
          ? 'border-cyan-400/40 bg-slate-900/88 text-cyan-50 shadow-[0_10px_35px_rgba(6,78,99,0.32)]'
          : 'border-cyan-200/80 bg-white/90 text-cyan-900 shadow-[0_10px_30px_rgba(14,116,144,0.12)]'
      )
    }
    if (colorScheme === '3ds') {
      return cn(
        'relative mb-6 rounded-lg border p-5 motion-safe:animate-ecs-fade-up',
        darkMode
          ? 'border-rose-500/45 bg-zinc-900/92 text-rose-50 shadow-[0_8px_26px_rgba(127,29,29,0.32)]'
          : 'border-rose-300/80 bg-white/94 text-rose-900 shadow-[0_8px_22px_rgba(244,63,94,0.15)]'
      )
    }
    return 'ecs-shape-banner ecs-diagonal-strip relative mb-6 rounded-[1.75rem] border border-cyan-300/55 bg-white/82 p-5 shadow-aero-float backdrop-blur-md motion-safe:animate-ecs-fade-up dark:border-teal-800/55 dark:bg-slate-900/78'
  }, [colorScheme, darkMode])

  const cardClass =
    visualStyle === 'parchment'
      ? 'ecs-shape-card ecs-shape-soft motion-safe:transition-shadow motion-safe:duration-300 motion-safe:hover:shadow-lg motion-safe:hover:ring-1 motion-safe:hover:ring-amber-400/25 dark:motion-safe:hover:ring-amber-500/20 border-amber-300/70 bg-amber-50/95 dark:border-amber-600/30 dark:bg-[#302519] dark:text-amber-50'
      : colorScheme === 'default'
        ? cn(
            'motion-safe:transition-shadow motion-safe:duration-300 rounded-xl',
            darkMode
              ? 'border border-slate-700 bg-slate-900 text-slate-100 shadow-sm'
              : 'border border-slate-200 bg-white text-slate-900 shadow-sm'
          )
        : colorScheme === 'violet'
        ? 'ecs-shape-card ecs-shape-soft motion-safe:transition-shadow motion-safe:duration-300 motion-safe:hover:shadow-lg motion-safe:hover:ring-1 motion-safe:hover:ring-cyan-300/55 dark:motion-safe:hover:ring-teal-600/45 border-cyan-200/75 bg-white/88 shadow-aero-card backdrop-blur-md dark:border-teal-900/55 dark:bg-slate-900/88 dark:shadow-aero-card-dark'
        : colorScheme === 'teal'
          ? 'ecs-shape-card ecs-shape-soft ecs-panel-teal motion-safe:transition-[filter] motion-safe:duration-200 hover:brightness-[1.02]'
          : colorScheme === 'sunset'
            ? cn(
                'ecs-shape-card ecs-shape-soft motion-safe:transition-shadow motion-safe:duration-300 backdrop-blur-md',
                darkMode
                  ? 'border-2 border-fuchsia-500/55 bg-slate-950/93 text-slate-100 shadow-[0_0_28px_rgba(217,70,239,0.22),inset_0_1px_0_rgba(255,255,255,0.06)]'
                  : 'border-2 border-pink-400/90 bg-amber-50/96 text-indigo-950 shadow-[0_12px_40px_rgba(236,72,153,0.22)]'
              )
            : colorScheme === 'wii'
              ? cn(
                  'motion-safe:transition-shadow motion-safe:duration-300 rounded-[1.75rem] backdrop-blur-md',
                  darkMode
                    ? 'border border-gray-600/65 bg-gray-800/93 shadow-[0_16px_48px_rgba(0,0,0,0.4)]'
                    : 'border border-white/85 bg-white/93 shadow-[0_18px_52px_rgba(15,23,42,0.07)]'
                )
              : colorScheme === 'xmb'
                ? cn(
                    'motion-safe:transition-shadow motion-safe:duration-300 rounded-xl backdrop-blur-md',
                    darkMode
                      ? 'border border-slate-600/55 bg-slate-900/94 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_38px_rgba(0,0,0,0.42)]'
                      : 'border border-slate-600/50 bg-slate-800/93 text-slate-100 shadow-[0_14px_40px_rgba(15,23,42,0.32)]'
                  )
                : colorScheme === 'cube'
                  ? cn(
                      'motion-safe:transition-shadow motion-safe:duration-300 rounded-xl backdrop-blur-md',
                      darkMode
                        ? 'border border-indigo-400/45 bg-[#111827]/96 text-slate-100 shadow-[0_0_28px_rgba(99,102,241,0.18)]'
                        : 'border border-indigo-300/55 bg-gradient-to-br from-slate-100 via-white to-indigo-100 text-indigo-950 shadow-[0_14px_42px_rgba(30,64,175,0.14)]'
                    )
                  : colorScheme === 'wiiu'
                    ? cn(
                        'motion-safe:transition-shadow motion-safe:duration-300 rounded-2xl backdrop-blur-md',
                        darkMode
                          ? 'border border-cyan-500/45 bg-slate-900/94 text-cyan-50 shadow-[0_0_26px_rgba(34,211,238,0.16)]'
                          : 'border border-cyan-200/85 bg-white/94 text-cyan-900 shadow-[0_12px_36px_rgba(14,116,144,0.12)]'
                      )
                    : cn(
                    'motion-safe:transition-shadow motion-safe:duration-300 rounded-xl backdrop-blur-md',
                    darkMode
                      ? 'border border-rose-500/40 bg-zinc-900/96 text-rose-50 shadow-[0_0_24px_rgba(225,29,72,0.18)]'
                      : 'border border-rose-300/80 bg-rose-50/95 text-rose-900 shadow-[0_12px_34px_rgba(244,63,94,0.14)]'
                    )

  const shellText = useMemo(() => {
    if (colorScheme === 'default') return darkMode ? 'text-slate-100' : 'text-slate-900'
    if (colorScheme === 'teal') return darkMode ? 'text-zinc-100' : 'text-gray-900'
    if (colorScheme === 'sunset') return darkMode ? 'text-slate-100' : 'text-indigo-950'
    if (colorScheme === 'wii') return darkMode ? 'text-gray-100' : 'text-gray-900'
    if (colorScheme === 'xmb') return 'text-slate-100'
    if (colorScheme === 'cube') return darkMode ? 'text-slate-100' : 'text-indigo-950'
    if (colorScheme === 'wiiu') return darkMode ? 'text-cyan-50' : 'text-cyan-900'
    if (colorScheme === '3ds') return darkMode ? 'text-rose-50' : 'text-rose-900'
    return 'text-slate-900 dark:text-slate-100'
  }, [colorScheme, darkMode])

  const loginIntroMuted = useMemo(
    () =>
      colorScheme === 'default'
        ? 'text-slate-600 dark:text-slate-400'
        : colorScheme === 'teal'
        ? 'text-gray-700 dark:text-gray-300'
        : colorScheme === 'sunset'
          ? darkMode
            ? 'text-slate-300'
            : 'text-indigo-900/75'
          : colorScheme === 'wii'
            ? darkMode
              ? 'text-gray-400'
              : 'text-gray-600'
            : colorScheme === 'xmb'
              ? 'text-slate-400'
              : colorScheme === 'cube'
                ? darkMode
                  ? 'text-slate-300'
                  : 'text-indigo-900/75'
                : colorScheme === 'wiiu'
                  ? darkMode
                    ? 'text-cyan-200/80'
                    : 'text-cyan-900/75'
                  : colorScheme === '3ds'
                    ? darkMode
                      ? 'text-rose-200/80'
                      : 'text-rose-900/75'
                : 'text-slate-500 dark:text-slate-400',
    [colorScheme, darkMode]
  )

  const loginHeroTypography = useMemo(() => {
    if (colorScheme === 'default') {
      return {
        badge: darkMode ? 'text-slate-400' : 'text-slate-600',
        title: darkMode ? 'text-slate-100 drop-shadow-none' : 'text-slate-900 drop-shadow-none',
        body: darkMode ? 'text-slate-300 drop-shadow-none' : 'text-slate-600 drop-shadow-none'
      }
    }
    if (!darkMode && colorScheme === 'sunset') {
      return {
        badge: 'text-indigo-950/90',
        title: 'text-indigo-950 drop-shadow-none',
        body: 'text-indigo-950/85 drop-shadow-none'
      }
    }
    if (!darkMode && colorScheme === 'wii') {
      return {
        badge: 'text-gray-700/90 drop-shadow-sm',
        title: 'text-gray-900 drop-shadow-sm',
        body: 'text-gray-800/90 drop-shadow-sm'
      }
    }
    if (!darkMode && colorScheme === 'wiiu') {
      return {
        badge: 'text-cyan-800/90 drop-shadow-sm',
        title: 'text-cyan-900 drop-shadow-none',
        body: 'text-cyan-900/85 drop-shadow-none'
      }
    }
    if (!darkMode && colorScheme === '3ds') {
      return {
        badge: 'text-rose-800/90 drop-shadow-sm',
        title: 'text-rose-900 drop-shadow-none',
        body: 'text-rose-900/85 drop-shadow-none'
      }
    }
    return {
      badge: 'text-white/85',
      title: 'drop-shadow-md',
      body: 'text-white/92 drop-shadow'
    }
  }, [colorScheme, darkMode])

  const headerSubtitleClass = useMemo(() => {
    if (colorScheme === 'default') return 'text-slate-500 dark:text-slate-400'
    if (colorScheme === 'teal') return 'text-gray-600 dark:text-gray-400'
    if (colorScheme === 'sunset') return 'text-slate-600 dark:text-slate-400'
    if (colorScheme === 'wii') return 'text-gray-600 dark:text-gray-400'
    if (colorScheme === 'xmb') return 'text-slate-400'
    if (colorScheme === 'cube') return 'text-slate-300/90 dark:text-slate-300/90'
    if (colorScheme === 'wiiu') return 'text-cyan-700 dark:text-cyan-200'
    if (colorScheme === '3ds') return 'text-rose-700 dark:text-rose-200'
    return 'text-slate-500 dark:text-slate-400'
  }, [colorScheme, darkMode])

  const workspaceShellClass = useMemo(() => {
    if (!useThemeLayout) return 'max-w-7xl px-5 py-7'
    if (colorScheme === 'default') return 'max-w-7xl px-5 py-7'
    if (colorScheme === 'wiiu') return 'max-w-[88rem] px-6 py-8'
    if (colorScheme === '3ds') return 'max-w-3xl px-4 py-6'
    if (colorScheme === 'xmb') return 'max-w-[84rem] px-6 py-7'
    if (colorScheme === 'sunset') return 'max-w-5xl px-5 py-7'
    if (colorScheme === 'cube') return 'max-w-6xl px-5 py-7'
    return 'max-w-7xl px-5 py-7'
  }, [colorScheme, useThemeLayout])

  const workspaceGridClass = 'ecs-workspace-grid motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:110ms]'

  const characterRowSelected = useMemo(
    () =>
      colorScheme === 'default'
        ? 'border-slate-500 bg-slate-100 text-slate-900 dark:border-slate-400 dark:bg-slate-800 dark:text-slate-50'
        : colorScheme === 'violet'
        ? 'border-sky-500 bg-sky-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-sky-400 dark:bg-sky-950/35'
        : colorScheme === 'teal'
          ? 'border-[#000080] bg-[#000080] text-white shadow-[inset_2px_2px_6px_rgba(0,0,0,0.35)] dark:border-[#7cb9ff] dark:bg-[#003366] dark:text-white'
          : colorScheme === 'wii'
            ? 'border-sky-500 bg-white shadow-[0_8px_22px_rgba(14,165,233,0.22)] dark:border-sky-400 dark:bg-gray-700/90 dark:text-gray-50 dark:shadow-[0_8px_24px_rgba(56,189,248,0.18)]'
            : colorScheme === 'xmb'
              ? 'border-sky-400 bg-slate-800/95 text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(56,189,248,0.2)]'
              : colorScheme === 'cube'
                ? 'border-indigo-300 bg-slate-100/90 text-indigo-950 shadow-[0_0_20px_rgba(129,140,248,0.2)] dark:border-indigo-300 dark:bg-slate-800/85 dark:text-slate-100'
                : colorScheme === 'wiiu'
                  ? 'border-cyan-300 bg-cyan-50 text-cyan-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:border-cyan-300 dark:bg-cyan-950/35 dark:text-cyan-50'
                  : colorScheme === '3ds'
                    ? 'border-rose-400 bg-rose-50 text-rose-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:border-rose-400 dark:bg-rose-950/30 dark:text-rose-50'
                    : darkMode
                      ? 'border-cyan-400 bg-fuchsia-950/40 text-slate-50 shadow-[0_0_16px_rgba(34,211,238,0.18)]'
                      : 'border-fuchsia-500 bg-pink-50 text-indigo-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]',
    [colorScheme, darkMode]
  )

  const statusPill = useMemo(
    () =>
      colorScheme === 'default'
        ? 'rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
        : colorScheme === 'violet'
        ? 'rounded-full border border-cyan-200/75 bg-white/85 px-3 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03] dark:border-teal-800/70 dark:bg-slate-900/65 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
        : colorScheme === 'teal'
          ? 'rounded-md border border-black/35 bg-[#ece9d8] px-3 py-1 text-xs font-medium text-gray-900 shadow-[inset_-1px_-1px_0_#404040,inset_1px_1px_0_#ffffff] motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.02] dark:bg-[#5a5a5a] dark:text-gray-100 dark:shadow-[inset_-1px_-1px_0_#222,inset_1px_1px_0_#888]'
          : colorScheme === 'wii'
            ? 'rounded-full border border-gray-400/60 bg-white/92 px-3 py-1 text-xs text-gray-800 shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03] dark:border-gray-600 dark:bg-gray-700/90 dark:text-gray-100'
            : colorScheme === 'xmb'
              ? 'rounded-md border border-slate-600 bg-slate-800/90 px-3 py-1 text-xs text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.02]'
              : colorScheme === 'cube'
                ? 'rounded-full border border-indigo-300/60 bg-white/90 px-3 py-1 text-xs text-indigo-950 shadow-[0_0_14px_rgba(129,140,248,0.16)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03] dark:border-indigo-300/65 dark:bg-slate-800/80 dark:text-slate-100'
                : colorScheme === 'wiiu'
                  ? 'rounded-full border border-cyan-300/65 bg-white/90 px-3 py-1 text-xs text-cyan-900 shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03] dark:border-cyan-300/60 dark:bg-cyan-950/45 dark:text-cyan-50'
                  : colorScheme === '3ds'
                    ? 'rounded-md border border-rose-300/75 bg-white/92 px-3 py-1 text-xs text-rose-900 shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03] dark:border-rose-300/60 dark:bg-rose-950/45 dark:text-rose-50'
                    : cn(
                        'rounded-full border-2 px-3 py-1 text-xs font-medium motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03]',
                        darkMode
                          ? 'border-cyan-400/45 bg-slate-950/70 text-slate-100 shadow-[0_0_18px_rgba(34,211,238,0.15)]'
                          : 'border-pink-400/85 bg-white/90 text-indigo-950 shadow-md'
                      ),
    [colorScheme, darkMode]
  )

  const loginOuterChrome = useMemo(() => {
    if (colorScheme === 'default') {
      return darkMode
        ? 'rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-md motion-safe:animate-ecs-fade-up'
        : 'rounded-2xl border border-slate-200 bg-white p-4 shadow-md motion-safe:animate-ecs-fade-up'
    }
    if (colorScheme === 'teal') {
      return 'rounded-lg border border-black/55 bg-[#c0c0c0]/88 p-4 shadow-[8px_8px_0_rgba(0,0,0,0.14)] motion-safe:animate-ecs-fade-up dark:border-black/65 dark:bg-[#404040]/92 dark:shadow-[6px_6px_0_rgba(0,0,0,0.45)]'
    }
    if (colorScheme === 'sunset') {
      return cn(
        'rounded-[2rem] border-2 p-4 backdrop-blur-xl motion-safe:animate-ecs-fade-up',
        darkMode
          ? 'border-fuchsia-500/50 bg-slate-950/55 shadow-[0_0_40px_rgba(217,70,239,0.12)]'
          : 'border-pink-400/85 bg-white/55 shadow-xl'
      )
    }
    if (colorScheme === 'wii') {
      return cn(
        'rounded-[2.25rem] border p-4 backdrop-blur-xl motion-safe:animate-ecs-fade-up',
        darkMode ? 'border-gray-600/50 bg-gray-900/45 shadow-[0_20px_55px_rgba(0,0,0,0.45)]' : 'border-white/70 bg-white/48 shadow-[0_22px_58px_rgba(15,23,42,0.09)]'
      )
    }
    if (colorScheme === 'xmb') {
      return 'rounded-2xl border border-slate-700/55 bg-slate-950/45 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl motion-safe:animate-ecs-fade-up'
    }
    if (colorScheme === 'cube') {
      return cn(
        'rounded-[2rem] border p-4 backdrop-blur-xl motion-safe:animate-ecs-fade-up',
        darkMode ? 'border-indigo-400/35 bg-slate-900/40 shadow-[0_0_32px_rgba(99,102,241,0.16)]' : 'border-indigo-300/50 bg-white/60 shadow-xl'
      )
    }
    if (colorScheme === 'wiiu') {
      return cn(
        'rounded-[1.6rem] border p-4 backdrop-blur-xl motion-safe:animate-ecs-fade-up',
        darkMode ? 'border-cyan-500/35 bg-slate-900/45 shadow-[0_0_30px_rgba(34,211,238,0.14)]' : 'border-cyan-200/75 bg-white/58 shadow-xl'
      )
    }
    if (colorScheme === '3ds') {
      return cn(
        'rounded-lg border p-4 backdrop-blur-xl motion-safe:animate-ecs-fade-up',
        darkMode ? 'border-rose-500/35 bg-zinc-900/52 shadow-[0_0_28px_rgba(244,63,94,0.15)]' : 'border-rose-200/80 bg-white/65 shadow-xl'
      )
    }
    return 'rounded-[2rem] border border-cyan-300/45 bg-white/40 p-4 shadow-aero-float backdrop-blur-xl motion-safe:animate-ecs-fade-up dark:border-teal-800/45 dark:bg-slate-950/45'
  }, [colorScheme, darkMode])

  const loginSignPanel = useMemo(() => {
    if (colorScheme === 'default') {
      return cn(
        'rounded-xl border p-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]',
        darkMode
          ? 'border-slate-700 bg-slate-900 text-slate-100 shadow-sm'
          : 'border-slate-200 bg-white text-slate-900 shadow-sm'
      )
    }
    if (colorScheme === 'teal') {
      return 'ecs-panel-teal rounded-md p-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]'
    }
    if (colorScheme === 'sunset') {
      return cn(
        'rounded-[1.75rem] border-2 p-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]',
        darkMode
          ? 'border-cyan-400/50 bg-slate-950/82 text-slate-100 shadow-[0_0_28px_rgba(34,211,238,0.12)]'
          : 'border-pink-400/90 bg-white/88 text-indigo-950 shadow-lg'
      )
    }
    if (colorScheme === 'wii') {
      return cn(
        'rounded-[1.85rem] border p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]',
        darkMode ? 'border-gray-600/55 bg-gray-800/92 text-gray-100' : 'border-white/80 bg-white/90 text-gray-900'
      )
    }
    if (colorScheme === 'xmb') {
      return cn(
        'rounded-xl border border-slate-600/60 bg-slate-900/88 p-6 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]'
      )
    }
    if (colorScheme === 'cube') {
      return cn(
        'rounded-[1.1rem] border p-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]',
        darkMode
          ? 'border-indigo-400/45 bg-slate-900/90 text-slate-100 shadow-[0_0_22px_rgba(99,102,241,0.14)]'
          : 'border-indigo-300/60 bg-white/92 text-indigo-950 shadow-lg'
      )
    }
    if (colorScheme === 'wiiu') {
      return cn(
        'rounded-[1.25rem] border p-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]',
        darkMode ? 'border-cyan-500/45 bg-slate-900/86 text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,0.12)]' : 'border-cyan-200/85 bg-white/92 text-cyan-900 shadow-lg'
      )
    }
    if (colorScheme === '3ds') {
      return cn(
        'rounded-md border p-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]',
        darkMode ? 'border-rose-500/45 bg-zinc-900/90 text-rose-50 shadow-[0_0_22px_rgba(244,63,94,0.12)]' : 'border-rose-200/85 bg-white/94 text-rose-900 shadow-lg'
      )
    }
    return 'ecs-aero-glass-panel rounded-[1.75rem] border border-white/70 bg-white/82 p-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms] dark:border-white/10 dark:bg-slate-900/82'
  }, [colorScheme, darkMode])

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
      <div className={cn('ecs-theme-shell ecs-aero-login-shell min-h-screen px-4 py-6 leading-relaxed', shellText)}>
        <div
          className={cn(
            'mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl grid-rows-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]',
            loginOuterChrome
          )}
        >
          <section
            className={cn(
              'relative flex min-h-0 flex-col overflow-hidden bg-gradient-to-br p-7 shadow-aero-float',
              colorScheme === 'violet' && 'ecs-shape-banner ecs-diagonal-strip rounded-[1.75rem]',
              colorScheme === 'teal' &&
                'rounded-md border border-black/50 shadow-[4px_4px_0_rgba(0,0,0,0.14)] dark:border-black/55 dark:shadow-[4px_4px_0_rgba(0,0,0,0.35)]',
              colorScheme === 'sunset' && 'ecs-shape-banner ecs-diagonal-strip rounded-[1.75rem]',
              colorScheme === 'wii' &&
                'rounded-[2rem] border border-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] dark:border-gray-600/45',
              colorScheme === 'xmb' &&
                'rounded-xl border border-slate-700/55 shadow-[inset_0_0_48px_rgba(0,0,0,0.35)]',
              colorScheme === 'cube' &&
                'rounded-[1.2rem] border border-indigo-300/45 shadow-[0_0_34px_rgba(99,102,241,0.24)] dark:border-indigo-400/35',
              colorScheme === 'wiiu' &&
                'rounded-[1.5rem] border border-cyan-200/55 shadow-[0_0_30px_rgba(34,211,238,0.22)] dark:border-cyan-500/35',
              colorScheme === '3ds' &&
                'rounded-md border border-rose-300/70 shadow-[0_0_26px_rgba(244,63,94,0.22)] dark:border-rose-500/35',
              colorScheme === 'default' &&
                'rounded-2xl border border-slate-200 shadow-md dark:border-slate-700',
              scheme.grad,
              !darkMode && colorScheme === 'sunset' && 'text-indigo-950',
              !darkMode && colorScheme === 'wii' && 'text-gray-900',
              !darkMode && colorScheme === 'wiiu' && 'text-cyan-900',
              !darkMode && colorScheme === '3ds' && 'text-rose-900',
              !darkMode && colorScheme === 'default' && 'text-slate-900',
              (darkMode || !['sunset', 'wii', 'wiiu', '3ds', 'default'].includes(colorScheme)) && 'text-white'
            )}
          >
            {colorScheme === 'violet' ? (
              <>
                <div
                  className="pointer-events-none absolute -right-24 top-8 h-56 w-56 rounded-[58%_42%_55%_45%] bg-white/25 blur-2xl motion-safe:animate-ecs-aero-float"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute -bottom-16 -left-12 h-48 w-72 rotate-12 rounded-[45%_55%_48%_52%] bg-lime-300/25 blur-2xl motion-safe:animate-ecs-aero-float"
                  style={{ animationDelay: '-7s' }}
                  aria-hidden
                />
              </>
            ) : null}
            {colorScheme === 'teal' ? (
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.14] motion-safe:animate-ecs-aero-ribbon"
                style={{
                  background:
                    'repeating-linear-gradient(-12deg, transparent, transparent 14px, rgba(255,255,255,0.35) 14px, rgba(255,255,255,0.35) 16px)'
                }}
                aria-hidden
              />
            ) : null}
            {colorScheme === 'sunset' ? (
              <>
                <div
                  className="pointer-events-none absolute -left-10 top-1/4 h-44 w-44 rounded-full bg-fuchsia-400/30 blur-3xl motion-safe:animate-ecs-aero-float dark:bg-fuchsia-600/20"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute -bottom-8 right-0 h-52 w-52 rounded-full bg-cyan-400/25 blur-3xl motion-safe:animate-ecs-aero-float dark:bg-cyan-500/15"
                  style={{ animationDelay: '-9s' }}
                  aria-hidden
                />
              </>
            ) : null}
            {colorScheme === 'wii' ? (
              <>
                <div
                  className="ecs-wii-shine-bubble pointer-events-none -left-[12%] top-[18%] h-56 w-56 motion-safe:animate-ecs-wii-drift"
                  aria-hidden
                />
                <div
                  className="ecs-wii-shine-bubble pointer-events-none bottom-[8%] right-[-8%] h-48 w-72 opacity-30 motion-safe:animate-ecs-wii-drift"
                  style={{ animationDelay: '-8s' }}
                  aria-hidden
                />
              </>
            ) : null}
            {colorScheme === 'xmb' ? (
              <>
                <div
                  className="ecs-xmb-wave-layer motion-safe:animate-ecs-xmb-wave pointer-events-none"
                  aria-hidden
                />
                <div className="ecs-xmb-login-sheen motion-safe:animate-ecs-xmb-wave pointer-events-none" aria-hidden />
              </>
            ) : null}
            {colorScheme === 'cube' ? (
              <>
                <div className="ecs-cube-lime-pulse pointer-events-none motion-safe:animate-ecs-aero-float" aria-hidden />
                <div
                  className="pointer-events-none absolute right-[12%] top-[14%] h-36 w-36 rotate-12 rounded-3xl border border-white/15 bg-white/5 blur-[1px]"
                  aria-hidden
                />
              </>
            ) : null}
            {colorScheme === 'wiiu' ? (
              <div className="ecs-wiiu-bar pointer-events-none motion-safe:animate-ecs-aero-ribbon" aria-hidden />
            ) : null}
            {colorScheme === '3ds' ? (
              <div className="ecs-3ds-hinge pointer-events-none" aria-hidden />
            ) : null}
            <div className="relative shrink-0">
              <div className={cn('text-xs font-semibold uppercase tracking-[0.25em]', loginHeroTypography.badge)}>
                EPIC CHARACTER STORAGE
              </div>
              <h1 className={cn('mt-4 text-4xl font-bold leading-tight', loginHeroTypography.title)}>
                Welcome back
              </h1>
              <p className={cn('mt-3 max-w-xl text-sm leading-relaxed', loginHeroTypography.body)}>
                Build, organize, and run your campaign sheets in one place. Login is required each time you open the app.
              </p>
            </div>
            <LoginUpdateLog className="relative mt-6 min-h-0 flex-1" />
          </section>

          <section className={loginSignPanel}>
            <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
            <p className={cn('mt-1 text-sm leading-relaxed', loginIntroMuted)}>
              Use your account email and password.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {(['login', 'register'] as AuthMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAuthMode(mode)}
                  className={cn(
                    'ecs-interactive px-3 py-1.5 text-xs font-semibold uppercase motion-safe:active:scale-[0.98]',
                    ecsAuthControlRound(colorScheme),
                    authMode === mode ? scheme.primary : loginMutedBtn
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
                      'ecs-interactive px-3 py-1.5 text-xs font-semibold uppercase motion-safe:active:scale-[0.98]',
                      ecsAuthControlRound(colorScheme),
                      authMode === mode ? scheme.primary : loginMutedBtn
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
                'mt-4 w-full px-4 py-2 text-sm font-semibold transition duration-150 hover:brightness-110 active:brightness-95 motion-safe:active:scale-[0.99]',
                ecsWideControlRound(colorScheme),
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
    <div className={cn('ecs-theme-shell relative min-h-screen overflow-hidden leading-relaxed', shellText)}>
      <div className="pointer-events-none absolute inset-0 ecs-palette-backdrop" aria-hidden>
        <div className="ecs-palette-layer ecs-palette-layer--default">
          <div className="ecs-default-backdrop" />
        </div>
        <div className="ecs-palette-layer ecs-palette-layer--violet ecs-aero-scene">
          <div className="ecs-aero-sky" />
          <div className="ecs-aero-ribbon motion-safe:animate-ecs-aero-ribbon" />
          <div className="ecs-aero-specular motion-safe:animate-ecs-aero-ribbon" style={{ animationDelay: '-4s' }} />
          <div
            className="ecs-aero-orb ecs-aero-orb--a motion-safe:animate-ecs-aero-float"
            style={{ animationDelay: '-5s' }}
          />
          <div
            className="ecs-aero-orb ecs-aero-orb--b motion-safe:animate-ecs-aero-float"
            style={{ animationDelay: '-11s' }}
          />
          <div
            className="ecs-aero-orb ecs-aero-orb--c motion-safe:animate-ecs-aero-float"
            style={{ animationDelay: '-17s' }}
          />
          <div className="absolute inset-0 ecs-grid-wash opacity-80" />
          <div className="ecs-aero-vignette" />
        </div>
        <div className="ecs-palette-layer ecs-palette-layer--teal">
          <div className="ecs-win98-wallpaper" />
          <div className="ecs-win98-pixel-grid" />
        </div>
        <div className="ecs-palette-layer ecs-palette-layer--sunset">
          <div className="ecs-y2k-space" />
          <div className="ecs-y2k-glow-ribbon motion-safe:animate-ecs-aero-ribbon" />
          <div className="ecs-y2k-grid-floor" />
        </div>
        <div className="ecs-palette-layer ecs-palette-layer--wii ecs-wii-scene">
          <div className="ecs-wii-backdrop" />
          <div className="ecs-wii-channel-grid" />
          <div className="ecs-wii-pane-matrix" />
          <div className="ecs-wii-focus-dot motion-safe:animate-ecs-pulse-soft" />
          <div
            className="ecs-wii-shine-bubble left-[8%] top-[22%] h-[min(52vmin,380px)] w-[min(52vmin,380px)] motion-safe:animate-ecs-wii-drift"
            aria-hidden
          />
          <div
            className="ecs-wii-shine-bubble bottom-[12%] right-[6%] h-[min(40vmin,300px)] w-[min(56vmin,400px)] opacity-35 motion-safe:animate-ecs-wii-drift"
            style={{ animationDelay: '-9s' }}
            aria-hidden
          />
        </div>
        <div className="ecs-palette-layer ecs-palette-layer--xmb ecs-xmb-scene">
          <div className="ecs-xmb-backdrop" />
          <div className="ecs-xmb-wave-layer motion-safe:animate-ecs-xmb-wave" />
          <div className="ecs-xmb-wave-layer ecs-xmb-wave-layer--secondary motion-safe:animate-ecs-xmb-wave" />
          <div className="ecs-xmb-column-guides" />
          <div className="ecs-xmb-spark-grid" />
        </div>
        <div className="ecs-palette-layer ecs-palette-layer--cube ecs-cube-scene">
          <div className="ecs-cube-backdrop" />
          <div className="ecs-cube-facet-grid" />
          <div className="ecs-cube-ghost-cube ecs-cube-ghost-cube--a motion-safe:animate-ecs-cube-drift" />
          <div className="ecs-cube-ghost-cube ecs-cube-ghost-cube--b motion-safe:animate-ecs-cube-drift" style={{ animationDelay: '-8s' }} />
          <div className="ecs-cube-lime-pulse motion-safe:animate-ecs-aero-float" />
        </div>
        <div className="ecs-palette-layer ecs-palette-layer--wiiu ecs-wiiu-scene">
          <div className="ecs-wiiu-backdrop" />
          <div className="ecs-wiiu-tile-grid" />
        </div>
        <div className="ecs-palette-layer ecs-palette-layer--3ds ecs-3ds-scene">
          <div className="ecs-3ds-backdrop" />
          <div className="ecs-3ds-dot-grid" />
        </div>
      </div>
      <div className={cn('relative mx-auto ecs-workspace-flow', workspaceShellClass)}>
        <header className={headerChrome} data-region="header">
          {colorScheme === 'teal' ? (
            <>
              <div
                className="pointer-events-none absolute left-0 right-0 top-0 h-2 rounded-t-[5px] bg-gradient-to-r from-[#000080] to-[#1084d0]"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute right-2 top-0 flex h-2 items-center gap-[3px] pr-1"
                aria-hidden
              >
                <span className="block h-1.5 w-3 rounded-[2px] bg-[#c0c0c0]/85" />
                <span className="block h-1.5 w-3 rounded-[2px] bg-[#c0c0c0]/85" />
                <span className="block h-1.5 w-3 rounded-[2px] bg-[#ff6b6b]/85" />
              </div>
            </>
          ) : null}
          {colorScheme === 'xmb' ? (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-sky-400/75 to-transparent"
              aria-hidden
            />
          ) : null}
          {colorScheme === 'wii' && !darkMode ? (
            <div
              className="pointer-events-none absolute inset-x-6 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-white/80 to-transparent"
              aria-hidden
            />
          ) : null}
          {colorScheme === 'cube' ? (
            <div
              className="pointer-events-none absolute bottom-2 left-3 top-3 w-1 rounded-full bg-gradient-to-b from-indigo-300 to-slate-200 opacity-90"
              aria-hidden
            />
          ) : null}
          {colorScheme === 'sunset' ? (
            <div
              className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-70 motion-safe:animate-ecs-pulse-soft"
              style={{
                background:
                  'conic-gradient(from 220deg at 50% 50%, rgba(244,114,182,0.0), rgba(244,114,182,0.18), rgba(56,189,248,0.16), rgba(190,242,100,0.12), rgba(244,114,182,0.0))',
                filter: 'blur(28px)'
              }}
              aria-hidden
            />
          ) : null}
          <div className="relative z-[1] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className={cn('text-2xl font-bold', colorScheme === 'sunset' && 'ecs-y2k-text-glow')}>
                Campaign Manager
              </h1>
              <p className={cn('text-sm', headerSubtitleClass)}>Track characters, campaigns, and encounters.</p>
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
          {colorScheme === 'teal' ? (
            <div
              className="ecs-win98-menubar relative z-[1] mt-2 flex items-center gap-3 border-t border-black/35 pt-1 text-[11px] font-semibold tracking-wide text-gray-800 dark:border-black/55 dark:text-gray-200"
              aria-hidden
            >
              <span><u>F</u>ile</span>
              <span><u>E</u>dit</span>
              <span><u>V</u>iew</span>
              <span><u>H</u>elp</span>
            </div>
          ) : null}
        </header>

        <div
          data-region="status"
          className="ecs-workspace-status flex flex-wrap gap-2 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:55ms]"
        >
          <div className={statusPill}>
            Mode: <span className="font-semibold">{rulesMode === 'dnd' ? 'DnD' : 'TTRPG'}</span>
          </div>
          <div className={statusPill}>
            Characters: <span className="font-semibold">{characters.length}</span>
          </div>
          <div className={statusPill}>
            Campaign: <span className="font-semibold">{activeCampaign?.name ?? 'Personal'}</span>
          </div>
        </div>

        <div className={workspaceGridClass} data-region="grid">
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
              <ul className="ecs-character-list mt-3 space-y-2">
                {filteredCharacters.map((character) => (
                  <li key={character.id}>
                    <button
                      type="button"
                      draggable={Boolean(selectedCampaignId && workspaceTab === 'battle')}
                      onDragStart={() => setDragCharacterId(character.id)}
                      onDragEnd={() => setDragCharacterId(null)}
                      onClick={() => openCharacter(character)}
                      className={cn(
                        'flex w-full gap-2 border px-2 py-2 text-left motion-safe:transition-[border-color,box-shadow,background-color] motion-safe:duration-200 motion-safe:hover:shadow-md motion-safe:hover:border-slate-300 dark:motion-safe:hover:border-slate-600',
                        ecsCharacterRowRound(colorScheme),
                        selectedId === character.id
                          ? characterRowSelected
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
                  className={cn('rounded-lg px-4 py-2 text-sm font-semibold text-white', scheme.primary)}
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

        {colorScheme === 'teal' && useThemeLayout ? (
          <div
            data-region="statusbar"
            className="ecs-win98-statusbar mt-2 flex items-center gap-0 border-t border-l border-white/85 border-b border-r border-black/55 bg-[#ece9d8] px-1 py-1 text-[11px] text-gray-900 shadow-[inset_-1px_-1px_0_#404040,inset_1px_1px_0_#ffffff] dark:bg-[#5a5a5a] dark:text-gray-100 dark:shadow-[inset_-1px_-1px_0_#222,inset_1px_1px_0_#888]"
          >
            <span className="ecs-win98-statusbar-cell">Ready</span>
            <span className="ecs-win98-statusbar-cell">{characters.length} object(s)</span>
            <span className="ecs-win98-statusbar-cell">Campaign: {activeCampaign?.name ?? 'Personal'}</span>
            <span className="ecs-win98-statusbar-cell ml-auto">{rulesMode === 'dnd' ? 'DnD mode' : 'TTRPG mode'}</span>
          </div>
        ) : null}

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
                  <SettingsLabel hint="TTRPG mode is generic and lightweight. DnD mode adds 5e-specific fields like ability scores, skills, and standard actions to your sheets.">
                    Mode
                  </SettingsLabel>
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
                  <SettingsLabel hint="Pick the look of the app. Each scheme inspires a different era and platform — colors, animations, and components all change.">
                    Color scheme
                  </SettingsLabel>
                  <select
                    value={colorScheme}
                    onChange={(event) => setColorScheme(event.target.value as ColorScheme)}
                    className="mt-1 w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                  >
                    <option value="default">Default · clean modern (no theme)</option>
                    <option value="violet">Aero meadow · glossy mid‑2000s</option>
                    <option value="teal">Classic chrome · late‑90s Windows</option>
                    <option value="sunset">Y2K neon · electric early‑2000s</option>
                    <option value="wii">Wii channels · silver + rounded tiles</option>
                    <option value="xmb">XMB wave · PS3‑style metallic bar</option>
                    <option value="cube">GameCube BIOS · indigo glass cube</option>
                    <option value="wiiu">Wii U dashboard · cyan glass tiles</option>
                    <option value="3ds">Nintendo 3DS · red shell + dual screen</option>
                  </select>
                </label>
                <label className="mt-2 block text-xs">
                  <SettingsLabel hint="Themed layout reshuffles the page (sidebar position, status bar, character list shape) to match the source material. Default layout keeps the colors but uses the standard sidebar-on-left workspace.">
                    Page layout
                  </SettingsLabel>
                  <select
                    value={useThemeLayout ? 'themed' : 'default'}
                    onChange={(event) => setUseThemeLayout(event.target.value === 'themed')}
                    className="mt-1 w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                  >
                    <option value="themed">Themed layout (per scheme)</option>
                    <option value="default">Default layout (sidebar left)</option>
                  </select>
                </label>
                <label className="mt-2 block text-xs">
                  <SettingsLabel hint="System follows your OS light/dark setting. Light forces a bright UI, Dark forces a dim UI for low-light play.">
                    Theme
                  </SettingsLabel>
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
                  <SettingsLabel hint="Clean is the standard surface treatment. Parchment overrides cards with a warm aged-paper feel, ideal for fantasy sessions.">
                    Visual style
                  </SettingsLabel>
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

